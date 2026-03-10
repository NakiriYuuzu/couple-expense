-- Migration: Add fcm_token column to user_settings table
-- Date: 2025-01-08
-- Description: Add FCM token storage for push notifications

-- Add fcm_token column to user_settings table
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fcm_token text;

-- Create index for faster lookups by FCM token (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_user_settings_fcm_token 
ON public.user_settings(fcm_token) 
WHERE fcm_token IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.user_settings.fcm_token 
IS 'Firebase Cloud Messaging token for push notifications';