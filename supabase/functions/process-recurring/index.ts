import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            return new Response(
                JSON.stringify({ error: 'Missing environment variables' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // A valid user JWT at the gateway is not permission to run a global admin job.
        if (req.headers.get('Authorization') !== `Bearer ${supabaseServiceKey}`) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            db: { schema: 'group_expense' }
        })

        const { data, error } = await supabase.rpc('process_recurring_expenses')

        if (error) {
            console.error('process_recurring_expenses error:', error)
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ processed: data }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Unexpected error:', message)
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})
