/** Yalnızca üretim derlemesinde service worker kaydeder (geliştirmede önbellek karışıklığı olmasın). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW kaydı başarısız:', err))
  })
}
