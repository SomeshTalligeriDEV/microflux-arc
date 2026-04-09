import { SupportedWallet, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { SnackbarProvider } from 'notistack'
import Home from './Home'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

// ── Determine supported wallets based on network ──

const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
let supportedWallets: SupportedWallet[]

if (network === 'localnet') {
  // LocalNet: use KMD wallet for development
  try {
    const kmdConfig = getKmdConfigFromViteEnvironment()
    supportedWallets = [
      {
        id: WalletId.KMD,
        options: {
          baseServer: kmdConfig.server,
          token: String(kmdConfig.token),
          port: String(kmdConfig.port),
        },
      },
    ]
  } catch {
    console.warn('[MICROFLUX] KMD config not found, falling back to Pera/Defly')
    supportedWallets = [
      { id: WalletId.PERA },
      { id: WalletId.DEFLY },
    ]
  }
} else {
  // Testnet / Mainnet: use real wallets (Pera, Defly, Lute)
  supportedWallets = [
    { id: WalletId.PERA },
    { id: WalletId.DEFLY },
    { id: WalletId.LUTE, options: { siteName: 'MICROFLUX-X1' } },
  ]
}

console.log(`[MICROFLUX] Network: ${network}`)
console.log(`[MICROFLUX] Wallets: ${supportedWallets.map((w) => w.id).join(', ')}`)

// ── App Component ─────────────────────────────

export default function App() {
  const algodConfig = getAlgodConfigFromViteEnvironment()

  console.log(`[MICROFLUX] Algod server: ${algodConfig.server}`)
  console.log(`[MICROFLUX] Algod port: ${algodConfig.port || '(none)'}`)

  const walletManager = new WalletManager({
    wallets: supportedWallets,
    defaultNetwork: algodConfig.network,
    networks: {
      [algodConfig.network]: {
        algod: {
          baseServer: algodConfig.server,
          port: algodConfig.port,
          token: String(algodConfig.token),
        },
      },
    },
    options: {
      resetNetwork: true,
    },
  })

  return (
    <SnackbarProvider maxSnack={3}>
      <WalletProvider manager={walletManager}>
        <Home />
      </WalletProvider>
    </SnackbarProvider>
  )
}
