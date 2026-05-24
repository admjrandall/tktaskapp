// Swipe gesture handler for sidebar open/close on touch devices.
// Right-swipe from the left edge opens the sidebar; left-swipe closes it.

const SWIPE_THRESHOLD_PX = 60
const EDGE_ZONE_PX = 32 // only trigger open gesture when touch starts in left edge zone

let _touchStartX = 0
let _touchStartY = 0
let _isEdgeSwipe = false

function _onTouchStart(e: TouchEvent): void {
  const touch = e.touches[0]
  if (!touch) return
  _touchStartX = touch.clientX
  _touchStartY = touch.clientY
  _isEdgeSwipe = touch.clientX <= EDGE_ZONE_PX
}

function _onTouchEnd(e: TouchEvent): void {
  const touch = e.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - _touchStartX
  const dy = touch.clientY - _touchStartY

  // Reject vertical-dominant swipes (scrolling)
  if (Math.abs(dy) > Math.abs(dx)) return
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return

  if (dx > 0 && _isEdgeSwipe) {
    _openSidebar()
  } else if (dx < 0) {
    _closeSidebar()
  }
}

function _openSidebar(): void {
  document.querySelectorAll<HTMLElement>('.sidebar,[data-sidebar]').forEach((el) => {
    el.classList.add('is-open')
  })
}

function _closeSidebar(): void {
  document.querySelectorAll<HTMLElement>('.sidebar,[data-sidebar]').forEach((el) => {
    el.classList.remove('is-open')
  })
}

function _onScrimClick(e: MouseEvent): void {
  if ((e.target as HTMLElement | null)?.classList.contains('sidebar-scrim')) {
    _closeSidebar()
  }
}

export function initMobileGestures(): void {
  document.addEventListener('touchstart', _onTouchStart, { passive: true })
  document.addEventListener('touchend', _onTouchEnd, { passive: true })
  document.addEventListener('click', _onScrimClick)
}

export function destroyMobileGestures(): void {
  document.removeEventListener('touchstart', _onTouchStart)
  document.removeEventListener('touchend', _onTouchEnd)
  document.removeEventListener('click', _onScrimClick)
}
