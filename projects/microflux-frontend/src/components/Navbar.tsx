import React from 'react';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  activeAddress: string | null;
  onConnectWallet: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentPage, onNavigate, activeAddress, onConnectWallet }) => {
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
            className={currentPage === 'ai' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); onNavigate('ai'); }}
          >
            AI Copilot
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
      </ul>

      <div className="navbar-actions">
        {activeAddress ? (
          <button className="btn btn-outline btn-sm" onClick={onConnectWallet}>
            <span className="status-dot status-dot-success"></span>
            {activeAddress.slice(0, 4)}...{activeAddress.slice(-4)}
          </button>
        ) : (
          <>
            <button className="btn btn-outline btn-sm" onClick={onConnectWallet}>
              CONNECT WALLET
            </button>
            <button className="btn btn-primary btn-sm btn-arrow" onClick={onConnectWallet}>
              START BUILDING
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
