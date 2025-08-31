import React, { useState, useEffect } from 'react'
import { getSyncQueueStatus, clearFailedSyncItems, debugSyncQueue, retrySpecificItem } from '../offline/sync.js'
import { toast } from 'react-toastify'

export default function SyncDebugger() {
  const [syncStatus, setSyncStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [retryItemId, setRetryItemId] = useState('')

  const refreshStatus = async () => {
    setLoading(true)
    try {
      const status = await getSyncQueueStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Error getting sync status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClearFailed = async () => {
    setLoading(true)
    try {
      await clearFailedSyncItems()
      await refreshStatus()
    } catch (error) {
      console.error('Error clearing failed items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDebugQueue = async () => {
    try {
      await debugSyncQueue()
    } catch (error) {
      console.error('Error debugging queue:', error)
    }
  }

  const handleRetryAll = async () => {
    setLoading(true)
    try {
      const status = await getSyncQueueStatus()
      if (status.retrying > 0 || status.failed > 0) {
        // Reset retry counts for all items
        const queue = await debugSyncQueue()
        if (queue && queue.length > 0) {
          for (const item of queue) {
            if (item.retryCount > 0) {
              await retrySpecificItem(item.id)
            }
          }
        }
        await refreshStatus()
        toast.success('Retried all failed items')
      }
    } catch (error) {
      console.error('Error retrying all items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRetrySpecific = async () => {
    if (!retryItemId.trim()) return
    
    setLoading(true)
    try {
      const success = await retrySpecificItem(Number(retryItemId))
      if (success) {
        toast.success(`Item ${retryItemId} synced successfully`)
        setRetryItemId('')
      } else {
        toast.error(`Item ${retryItemId} still failed`)
      }
      await refreshStatus()
    } catch (error) {
      console.error('Error retrying specific item:', error)
      toast.error('Failed to retry item')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  if (!syncStatus) return null

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '0.5rem',
      fontSize: '0.875rem'
    }}>
      <span>🔄</span>
      <span>Total: <strong>{syncStatus.total}</strong></span>
      <span>Pending: <strong style={{ color: 'var(--primary)' }}>{syncStatus.pending}</strong></span>
      <span>Retrying: <strong style={{ color: 'var(--warning)' }}>{syncStatus.retrying}</strong></span>
      <span>Failed: <strong style={{ color: 'var(--danger)' }}>{syncStatus.failed}</strong></span>
      
      <button 
        onClick={refreshStatus} 
        disabled={loading}
        className="btn btn--sm"
        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        title="Refresh sync status"
      >
        {loading ? '⏳' : '🔄'}
      </button>
      
      <button 
        onClick={handleDebugQueue} 
        className="btn btn--sm btn--secondary"
        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        title="Debug sync queue in console"
      >
        🐛
      </button>
      
      {(syncStatus.retrying > 0 || syncStatus.failed > 0) && (
        <button 
          onClick={handleRetryAll} 
          disabled={loading}
          className="btn btn--sm btn--warning"
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          title="Retry all failed/retrying items"
        >
          🔄
        </button>
      )}
      
      {syncStatus.failed > 0 && (
        <>
          <input
            type="number"
            value={retryItemId}
            onChange={(e) => setRetryItemId(e.target.value)}
            placeholder="Item ID"
            style={{ 
              width: '60px', 
              fontSize: '0.75rem', 
              padding: '0.25rem',
              border: '1px solid var(--border)',
              borderRadius: '4px'
            }}
          />
          <button 
            onClick={handleRetrySpecific} 
            disabled={loading || !retryItemId.trim()}
            className="btn btn--sm btn--secondary"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            title="Retry specific item by ID"
          >
            ▶️
          </button>
          <button 
            onClick={handleClearFailed} 
            disabled={loading}
            className="btn btn--sm btn--danger"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            title="Clear failed sync items"
          >
            🗑️
          </button>
        </>
      )}
    </div>
  )
}
