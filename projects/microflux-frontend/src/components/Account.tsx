import { useWallet } from '@txnlab/use-wallet-react'
import { useMemo } from 'react'
import { ellipseAddress } from '../utils/ellipseAddress'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

const Account = () => {
  const { activeAddress } = useWallet()
  const algoConfig = getAlgodConfigFromViteEnvironment()

  const networkName = useMemo(() => {
    return algoConfig.network === '' ? 'localnet' : algoConfig.network.toLocaleLowerCase()
  }, [algoConfig.network])

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span className="status-dot status-dot-success"></span>
        <span className="text-sm font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Connected
        </span>
      </div>
      <a
        className="text-mono text-sm"
        target="_blank"
        rel="noopener noreferrer"
        href={`https://lora.algokit.io/${networkName}/account/${activeAddress}/`}
        style={{ display: 'block', marginBottom: '6px', wordBreak: 'break-all' }}
      >
        {ellipseAddress(activeAddress)}
      </a>
      <div className="text-xs text-muted">Network: {networkName}</div>
    </div>
  )
}

export default Account
