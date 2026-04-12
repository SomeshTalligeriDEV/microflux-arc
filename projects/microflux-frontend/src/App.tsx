import { SupportedWallet, WalletId, WalletManager, WalletProvider } from '@txnlab/use-wallet-react'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Home from './Home'
import ApproveExecution from './ApproveExecution'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
let supportedWallets: SupportedWallet[]

if (network === 'localnet') {
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
  supportedWallets = [
    { id: WalletId.PERA },
    { id: WalletId.DEFLY },
    { id: WalletId.LUTE, options: { siteName: 'MICROFLUX-X1' } },
  ]
}

console.log(`[MICROFLUX] Network: ${network}`)

function ApproveExecutionRoute() {
  const { token } = useParams<{ token: string }>()

  return token ? <ApproveExecution token={decodeURIComponent(token)} /> : <Home />
}

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
        <BrowserRouter>
          <Routes>
            <Route path="/approve/:token" element={<ApproveExecutionRoute />} />
            <Route path="/*" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </SnackbarProvider>
  )
}
