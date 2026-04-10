import React from 'react';
import { truncateAddress } from '../services/walletService';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  activeAddress: string | null;
  onConnectWallet: () => void;
  balance: number | null; // ALGO balance
  networkName: string;
  isLinked?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  activeAddress,
  onConnectWallet,
  balance,
  networkName,
  isLinked = false,
}) => {
  return (
    <nav className="navbar">
      <div className="navbar-logo" onClick={() => onNavigate('home')} style={{ cursor: 'pointer' }}>
        <div className="navbar-logo-icon">
          <span></span><span></span>
          <span></span><span></span>
        </div>
        MICROFLUX
      </div>

      <ul className="navbar-links">
        <li>
          <a
            href="#"
            className={currentPage === 'builder' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); onNavigate('builder'); }}
          >
            Builder
          </a>
        </li>
        <li>
          <a
            href="#"
            className={currentPage === 'marketplace' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); onNavigate('marketplace'); }}
          >
            Marketplace
          </a>
        </li>
        <li>
          <a
            href="#"
            className={currentPage === 'market' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); onNavigate('market'); }}
          >
            Market
          </a>
        </li>
        <li>
          <a
            href="#"
            className={currentPage === 'saved' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); onNavigate('saved'); }}
          >
            Saved Workflows
          </a>
        </li>
      </ul>

      <div className="navbar-actions">
        {activeAddress ? (
          <button
            className="btn btn-sm"
            onClick={onConnectWallet}
            style={{
              background: 'var(--color-white)',
              color: 'var(--color-black)',
              border: '1px solid var(--color-white)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span className="status-dot status-dot-success"></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
              {truncateAddress(activeAddress, 4)}
            </span>
            {balance !== null && (
              <span style={{
                borderLeft: '1px solid rgba(0,0,0,0.2)',
                paddingLeft: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
              }}>
                {balance.toFixed(2)} ALGO
              </span>
            )}
          </button>
        ) : (
          <>
            <button
              className="btn btn-sm"
              onClick={onConnectWallet}
              style={{
                background: 'var(--color-white)',
                color: 'var(--color-black)',
                border: '1px solid var(--color-white)',
                fontWeight: 700,
              }}
            >
              CONNECT WALLET
            </button>
            <button className="btn btn-primary btn-sm btn-arrow" onClick={() => onNavigate('builder')}>
              START BUILDING
            </button>
          </>
        )}

        {/* Network Badge */}
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

        {activeAddress && (
          <span style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: isLinked ? 'var(--color-success)' : 'var(--color-error)',
            background: isLinked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isLinked ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {isLinked ? 'TG Linked' : 'TG Unlinked'}
          </span>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
