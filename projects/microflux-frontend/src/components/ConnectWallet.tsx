import { useWallet, Wallet, WalletId } from '@txnlab/use-wallet-react'
import { useState, useEffect, useCallback } from 'react'
import {
  fetchAccountBalance,
  fetchAccountAssets,
  truncateAddress,
  getExplorerAccountUrl,
  type AccountBalance,
  type AssetHolding,
} from '../services/walletService'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface ConnectWalletInterface {
  openModal: boolean
  closeModal: () => void
  onBalanceUpdate?: (balance: number) => void
}

const ConnectWallet = ({ openModal, closeModal, onBalanceUpdate }: ConnectWalletInterface) => {
  const { wallets, activeAddress } = useWallet()
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [assets, setAssets] = useState<AssetHolding[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const algoConfig = getAlgodConfigFromViteEnvironment()
  const networkName = algoConfig.network === '' ? 'localnet' : algoConfig.network.toLowerCase()

  const isKmd = (wallet: Wallet) => wallet.id === WalletId.KMD

  // Wallet display names and descriptions
  const walletInfo: Record<string, { description: string }> = {
    [WalletId.PERA]: { description: 'Mobile & Web wallet' },
    [WalletId.DEFLY]: { description: 'DeFi-focused wallet' },
    [WalletId.LUTE]: { description: 'Browser extension wallet' },
    [WalletId.KMD]: { description: 'LocalNet development wallet' },
  }

  // Fetch balance & assets when connected
  const refreshAccountData = useCallback(async () => {
    if (!activeAddress) return
    setLoading(true)
    setError(null)
    try {
      const [bal, ast] = await Promise.all([
        fetchAccountBalance(activeAddress),
        fetchAccountAssets(activeAddress),
      ])
      setBalance(bal)
      setAssets(ast)
      onBalanceUpdate?.(bal.balanceAlgos)
    } catch (err) {
      setError('Failed to fetch account data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeAddress, onBalanceUpdate])

  useEffect(() => {
    if (activeAddress && openModal) {
      refreshAccountData()
    }
  }, [activeAddress, openModal, refreshAccountData])

  // Also fetch balance on initial connect (even when modal not open)
  useEffect(() => {
    if (activeAddress) {
      refreshAccountData()
    } else {
      setBalance(null)
      setAssets([])
    }
  }, [activeAddress, refreshAccountData])

  const handleConnect = async (wallet: Wallet) => {
    setError(null)
    try {
      await wallet.connect()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('User refused')) {
        setError('Connection rejected')
      } else if (msg.includes('not installed') || msg.includes('not found')) {
        setError(`${wallet.metadata.name} is not installed`)
      } else {
        setError(msg)
      }
    }
  }

  const handleDisconnect = async () => {
    if (wallets) {
      const activeWallet = wallets.find((w) => w.isActive)
      if (activeWallet) {
        await activeWallet.disconnect()
      } else {
        localStorage.removeItem('@txnlab/use-wallet:v3')
        window.location.reload()
      }
      setBalance(null)
      setAssets([])
      onBalanceUpdate?.(0)
    }
  }

  return (
    <dialog
      id="connect_wallet_modal"
      className={`modal ${openModal ? 'modal-open' : ''}`}
      style={{ display: openModal ? 'flex' : 'none' }}
      onClick={closeModal}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="text-xl font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {activeAddress ? 'Wallet' : 'Connect Wallet'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeAddress && (
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: networkName === 'mainnet' ? 'var(--color-success)' :
                       networkName === 'testnet' ? 'var(--color-warning)' :
                       'var(--color-info)',
                background: networkName === 'mainnet' ? 'rgba(34,197,94,0.1)' :
                            networkName === 'testnet' ? 'rgba(234,179,8,0.1)' :
                            'rgba(59,130,246,0.1)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${
                  networkName === 'mainnet' ? 'rgba(34,197,94,0.3)' :
                  networkName === 'testnet' ? 'rgba(234,179,8,0.3)' :
                  'rgba(59,130,246,0.3)'
                }`,
              }}>
                {networkName}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-xs)',
            marginBottom: '16px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Connected State ──────────────── */}
        {activeAddress ? (
          <div>
            {/* Address Card */}
            <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span className="status-dot status-dot-success"></span>
                <span className="text-sm font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Connected
                </span>
                {wallets?.find((w) => w.isActive) && (
                  <span className="tag tag-sm tag-action">
                    {wallets.find((w) => w.isActive)?.metadata.name}
                  </span>
                )}
              </div>

              <a
                target="_blank"
                rel="noopener noreferrer"
                href={getExplorerAccountUrl(activeAddress, networkName)}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  wordBreak: 'break-all',
                  marginBottom: '8px',
                  transition: 'color 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
              >
                {activeAddress}
              </a>

              <div className="text-xs text-muted">
                Network: {networkName} • Click address to view on explorer
              </div>
            </div>

            {/* Balance Card */}
            {loading ? (
              <div className="skeleton" style={{ height: '90px', marginBottom: '16px' }}></div>
            ) : balance ? (
              <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
                <div className="text-xs text-uppercase" style={{
                  letterSpacing: '0.08em', fontWeight: 600,
                  color: 'var(--color-text-tertiary)', marginBottom: '8px',
                }}>
                  Balance
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                  }}>
                    {balance.balanceAlgos.toFixed(4)}
                  </span>
                  <span className="text-sm text-muted">ALGO</span>
                </div>

                <div className="sim-panel" style={{ padding: '8px 12px' }}>
                  <div className="sim-row" style={{ padding: '4px 0' }}>
                    <span className="sim-label">Available</span>
                    <span className="sim-value">{(balance.balanceAlgos - balance.minBalance).toFixed(4)} ALGO</span>
                  </div>
                  <div className="sim-row" style={{ padding: '4px 0' }}>
                    <span className="sim-label">Min. Balance</span>
                    <span className="sim-value">{balance.minBalance.toFixed(4)} ALGO</span>
                  </div>
                  {balance.pendingRewards > 0 && (
                    <div className="sim-row" style={{ padding: '4px 0' }}>
                      <span className="sim-label">Rewards</span>
                      <span className="sim-value" style={{ color: 'var(--color-success)' }}>
                        +{balance.pendingRewards.toFixed(6)} ALGO
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Asset Holdings */}
            {assets.length > 0 && (
              <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
                <div className="text-xs text-uppercase" style={{
                  letterSpacing: '0.08em', fontWeight: 600,
                  color: 'var(--color-text-tertiary)', marginBottom: '10px',
                }}>
                  Assets ({assets.length})
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {assets.map((asset) => (
                    <div key={asset.assetId} className="sim-row" style={{ padding: '6px 0' }}>
                      <div>
                        <span className="text-xs font-bold">
                          {asset.unitName || `ASA #${asset.assetId}`}
                        </span>
                        <span className="text-xs text-muted" style={{ marginLeft: '6px' }}>
                          ID: {asset.assetId}
                        </span>
                      </div>
                      <span className="sim-value">{asset.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refresh & Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" onClick={refreshAccountData} style={{ flex: 1 }}>
                ↻ REFRESH
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: 'var(--color-error)',
                  color: 'white',
                  border: '1px solid var(--color-error)',
                }}
                onClick={handleDisconnect}
              >
                DISCONNECT
              </button>
            </div>
          </div>
        ) : (
          /* ── Disconnected State ─────────── */
          <div>
            <p className="text-xs text-muted" style={{ marginBottom: '16px', lineHeight: '1.6' }}>
              Select a wallet provider to connect. Your private keys are never stored —
              all signing happens through the wallet provider.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {wallets?.map((wallet) => (
                <button
                  data-test-id={`${wallet.id}-connect`}
                  key={`provider-${wallet.id}`}
                  onClick={() => handleConnect(wallet)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 18px',
                    background: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    width: '100%',
                    textAlign: 'left',
                    color: 'var(--color-text-primary)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)'
                    e.currentTarget.style.background = 'var(--color-bg-hover)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.background = 'var(--color-bg-tertiary)'
                  }}
                >
                  {/* Wallet Icon */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {!isKmd(wallet) ? (
                      <img
                        alt={`${wallet.metadata.name} icon`}
                        src={wallet.metadata.icon}
                        style={{ objectFit: 'contain', width: '24px', height: '24px' }}
                      />
                    ) : (
                      <span style={{ fontSize: '18px' }}>🔧</span>
                    )}
                  </div>

                  {/* Wallet Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {isKmd(wallet) ? 'LocalNet Wallet' : wallet.metadata.name}
                    </div>
                    <div style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                      marginTop: '2px',
                    }}>
                      {walletInfo[wallet.id]?.description || 'Algorand wallet'}
                    </div>
                  </div>

                  {/* Arrow */}
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: '16px' }}>→</span>
                </button>
              ))}
            </div>

            {/* Security Note */}
            <div style={{
              marginTop: '20px',
              padding: '10px 14px',
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '14px' }}>🔒</span>
              <p className="text-xs text-muted" style={{ lineHeight: '1.5' }}>
                <strong>Security:</strong> MICROFLUX-X1 never stores private keys.
                All transaction signing happens through your wallet provider.
              </p>
            </div>
          </div>
        )}

        {/* Close Button (always visible) */}
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={closeModal}>
            CLOSE
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default ConnectWallet
