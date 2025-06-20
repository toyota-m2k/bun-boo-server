export function launch<T>(fn: () => Promise<T>, silent:boolean = false) {
  fn().catch((e) => {
    if(!silent) {
      console.error(e)
    }
  })
}

export async function delay(msec: number, signal?: AbortSignal): Promise<void> {
  let abortListener: (() => void) | undefined = undefined
  const promise = new Promise((resolve, reject) => {
    let timeout: NodeJS.Timeout | undefined = undefined
    if (signal !== undefined) {
      abortListener = () => {
        if (timeout !== undefined) {
          clearTimeout(timeout)
        }
        reject(signal.reason)
      }
      signal.addEventListener("abort", abortListener)
    }
    timeout = setTimeout(resolve, msec)
  })
  try {
    await promise
  } finally {
    if (signal !== undefined && abortListener !== undefined) {
      signal.removeEventListener("abort", abortListener)
    }
  }
}

export function withDelay<T>(msec:number, fn:(()=>Promise<T>)|(()=>void)) {
  launch(async ()=>{
    await delay(msec)
    fn()
  })
}
