import { useWallet, Wallet, WalletId } from '@txnlab/use-wallet-react'
import Account from './Account'

interface ConnectWalletInterface {
  openModal: boolean
  closeModal: () => void
}

const ConnectWallet = ({ openModal, closeModal }: ConnectWalletInterface) => {
  const { wallets, activeAddress } = useWallet()

  const isKmd = (wallet: Wallet) => wallet.id === WalletId.KMD

  return (
    <dialog id="connect_wallet_modal" className={`modal ${openModal ? 'modal-open' : ''}`} style={{ display: openModal ? 'flex' : 'none' }}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="text-xl font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Connect Wallet
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activeAddress && (
            <>
              <Account />
              <div className="divider" />
            </>
          )}

          {!activeAddress &&
            wallets?.map((wallet) => (
              <button
                data-test-id={`${wallet.id}-connect`}
                className="btn btn-outline"
                key={`provider-${wallet.id}`}
                onClick={() => wallet.connect()}
                style={{ justifyContent: 'flex-start', width: '100%' }}
              >
                {!isKmd(wallet) && (
                  <img
                    alt={`wallet_icon_${wallet.id}`}
                    src={wallet.metadata.icon}
                    style={{ objectFit: 'contain', width: '24px', height: '24px' }}
                  />
                )}
                <span>{isKmd(wallet) ? 'LocalNet Wallet' : wallet.metadata.name}</span>
              </button>
            ))}
        </div>

        <div className="modal-action">
          <button
            data-test-id="close-wallet-modal"
            className="btn btn-outline"
            onClick={closeModal}
          >
            Close
          </button>
          {activeAddress && (
            <button
              className="btn btn-danger"
              data-test-id="logout"
              onClick={async () => {
                if (wallets) {
                  const activeWallet = wallets.find((w) => w.isActive)
                  if (activeWallet) {
                    await activeWallet.disconnect()
                  } else {
                    // Required for logout/cleanup of inactive providers
                    // For instance, when you login to localnet wallet and switch network
                    // to testnet/mainnet or vice verse.
                    localStorage.removeItem('@txnlab/use-wallet:v3')
                    window.location.reload()
                  }
                }
              }}
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
export default ConnectWallet
