import { useEffect, useState } from 'react'
import { manualSync, getSyncStatus } from '../offline/sync.js'
import { getPendingSyncCount } from '../offline/idb.js'

export default function ConnectionStatus() {
  const [status, setStatus] = useState({ isOnline: navigator.onLine, syncInProgress: false })
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const updateStatus = async () => {
      // getSyncStatus returns a plain object, not a Promise
      setStatus(getSyncStatus())
      // getPendingSyncCount returns a Promise
      const count = await getPendingSyncCount()
      setPendingCount(count)
    }

    const handleConnectionChange = () => {
      updateStatus()
    }

    // Update status every 5 seconds
    const interval = setInterval(updateStatus, 5000)
    
    // Listen for connection status changes
    window.addEventListener('connectionStatusChanged', handleConnectionChange)
    
    // Initial status
    updateStatus()

    return () => {
      clearInterval(interval)
      window.removeEventListener('connectionStatusChanged', handleConnectionChange)
    }
  }, [])

  const handleManualSync = async () => {
    await manualSync()
    // Update status after sync
    setTimeout(async () => {
      // getSyncStatus returns a plain object, not a Promise
      setStatus(getSyncStatus())
      // getPendingSyncCount returns a Promise
      const count = await getPendingSyncCount()
      setPendingCount(count)
    }, 1000)
  }

  if (status.isOnline && pendingCount === 0 && !status.syncInProgress) {
    return null // Don't show anything when everything is synced and online
  }

  return (
    <div className="connection-status">
      <div className="connection-indicator">
        <div className={`status-dot ${status.isOnline ? 'online' : 'offline'}`}></div>
        <span className="status-text">
          {status.isOnline ? '🟢 Online' : '🔴 Offline'}
        </span>
      </div>
      
      {status.syncInProgress && (
        <div className="sync-status">
          <span className="sync-spinner">🔄</span>
          Syncing...
        </div>
      )}
      
      {pendingCount > 0 && (
        <div className="pending-sync">
          <span className="pending-count">{pendingCount}</span>
          pending changes
        </div>
      )}
      
      {status.isOnline && pendingCount > 0 && (
        <button 
          className="button button--sm button--primary"
          onClick={handleManualSync}
          disabled={status.syncInProgress}
        >
          {status.syncInProgress ? '🔄 Syncing...' : '🔄 Sync Now'}
        </button>
      )}
      
      {!status.isOnline && (
        <div className="offline-message">
          Changes saved locally. Will sync when online.
        </div>
      )}
    </div>
  )
}
