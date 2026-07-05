// 防禦性 storage guard：Node 25 內建 localStorage 在未帶 --localstorage-file 時會炸
// （getItem 不是 function 或存取即拋錯）。若偵測到不可用，就以完整 in-memory
// Storage 實作覆蓋 globalThis.localStorage / sessionStorage，拆掉這顆測試炸彈。

class MemoryStorage implements Storage {
    private map = new Map<string, string>()

    get length(): number {
        return this.map.size
    }

    clear(): void {
        this.map.clear()
    }

    getItem(key: string): string | null {
        return this.map.has(key) ? this.map.get(key)! : null
    }

    key(index: number): string | null {
        return Array.from(this.map.keys())[index] ?? null
    }

    removeItem(key: string): void {
        this.map.delete(key)
    }

    setItem(key: string, value: string): void {
        this.map.set(key, String(value))
    }

    [name: string]: any
}

function isUsable(storage: unknown): boolean {
    try {
        return !!storage && typeof (storage as Storage).getItem === 'function'
    } catch {
        return false
    }
}

function readGlobal(name: 'localStorage' | 'sessionStorage'): unknown {
    try {
        return (globalThis as Record<string, unknown>)[name]
    } catch {
        return undefined
    }
}

function install(name: 'localStorage' | 'sessionStorage'): void {
    if (isUsable(readGlobal(name))) return
    Object.defineProperty(globalThis, name, {
        value: new MemoryStorage(),
        configurable: true,
        writable: true
    })
}

install('localStorage')
install('sessionStorage')
