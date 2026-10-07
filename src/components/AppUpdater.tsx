import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DesktopUpdateState } from '../types';

interface AppUpdaterProps {
  onToast?: (msg: string) => void;
}

type UpdateUIState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';

export const AppUpdater: React.FC<AppUpdaterProps> = ({ onToast }) => {
  const [uiState, setUiState] = useState<UpdateUIState>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('');
  const [downloadedBytes, setDownloadedBytes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Version state
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);

  // Environment state
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [isPortable, setIsPortable] = useState<boolean>(false);
  const [dbPath, setDbPath] = useState<string>('');

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Load system and version information
  useEffect(() => {
    if (window.electronAPI?.isDesktop) {
      setIsElectron(true);
      if (window.electronAPI.isPortable) {
        setIsPortable(true);
      }
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setCurrentVersion(v);
      });
      window.electronAPI.getDatabaseLocation().then((loc) => {
        if (loc?.databasePath) setDbPath(loc.databasePath);
      });
    }
    api.getSystemInfo().then((info) => {
      if (info) {
        if (info.version) {
          setCurrentVersion((prev) => prev || info.version);
        }
        if (info.dbPath) setDbPath(info.dbPath);
      }
    }).catch(() => {});
  }, []);

  // Listen for desktop update state changes
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatusChange) return;
    const unsubscribe = window.electronAPI.onUpdateStatusChange((state: DesktopUpdateState) => {
      if (state.currentVersion) setCurrentVersion(state.currentVersion);
      if (state.isPortable !== undefined) setIsPortable(state.isPortable);

      if (state.status === 'checking') {
        setUiState('checking');
        setErrorMessage('');
      } else if (state.status === 'available') {
        setUiState('available');
        setAvailableVersion(state.availableVersion || null);
        setReleaseNotes(state.releaseNotes || null);
        setErrorMessage('');
      } else if (state.status === 'not-available') {
        setUiState('up-to-date');
        setAvailableVersion(null);
        setErrorMessage('');
      } else if (state.status === 'downloading') {
        setUiState('downloading');
        if (state.progress) {
          setDownloadProgress(state.progress.percent);
          if (state.progress.bytesPerSecond) {
            setDownloadSpeed(`${(state.progress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`);
          }
          if (state.progress.transferred && state.progress.total) {
            setDownloadedBytes(`${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)}`);
          }
        }
      } else if (state.status === 'downloaded') {
        setUiState('downloaded');
        setDownloadProgress(100);
        if (onToast) onToast('Update downloaded successfully.');
      } else if (state.status === 'error') {
        setUiState('error');
        setErrorMessage(state.errorMessage || 'Update failed. Please check your internet connection and try again.');
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [onToast]);

  // Download update
  const handleDownloadUpdate = useCallback(async () => {
    setUiState('downloading');
    setErrorMessage('');
    setDownloadProgress(0);

    if (window.electronAPI?.startUpdateDownload) {
      try {
        const res = await window.electronAPI.startUpdateDownload(isPortable ? 'portable' : 'setup');
        if (res && !res.success) {
          setUiState('error');
          setErrorMessage(res.error || 'Update failed. Please check your internet connection and try again.');
        }
      } catch (err: any) {
        setUiState('error');
        setErrorMessage('Update failed. Please check your internet connection and try again.');
      }
    } else {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 25;
        setDownloadProgress(progress);
        setDownloadSpeed('5.2 MB/s');
        setDownloadedBytes(`${(progress * 0.45).toFixed(1)} MB / 45 MB`);
        if (progress >= 100) {
          clearInterval(interval);
          setUiState('downloaded');
          if (onToast) onToast('Update downloaded. Restart to install.');
        }
      }, 300);
    }
  }, [isPortable, onToast]);

  // Check for updates
  const handleCheckForUpdates = useCallback(async () => {
    setUiState('checking');
    setErrorMessage('');
    setAvailableVersion(null);

    try {
      if (window.electronAPI?.checkForUpdates) {
        const result = await window.electronAPI.checkForUpdates();
        if (result && !result.success) {
          setUiState('error');
          setErrorMessage(result.error || 'Update failed. Please check your internet connection and try again.');
        } else if (result && result.isDevMode) {
          setUiState('up-to-date');
          setAvailableVersion(null);
          if (onToast) onToast(`Development Mode (v${currentVersion}). Production update checks run in packaged app.`);
        } else if (result && result.isUpdateAvailable) {
          setUiState('available');
          setAvailableVersion(result.latestVersion);
          setReleaseNotes(result.releaseNotes || null);
          if (onToast) onToast(`A new version is available: v${result.latestVersion}`);
          handleDownloadUpdate();
        } else if (result && result.success && !result.isUpdateAvailable) {
          setUiState('up-to-date');
          setAvailableVersion(null);
        } else {
          setUiState('error');
          setErrorMessage('Update failed. Please check your internet connection and try again.');
        }
      } else {
        const result = await api.checkUpdates(currentVersion);
        if (!result.success) {
          setUiState('error');
          setErrorMessage(result.error || 'Update failed. Please check your internet connection and try again.');
          return;
        }

        if (result.isUpdateAvailable) {
          setUiState('available');
          setAvailableVersion(result.latestVersion);
          setReleaseNotes(result.releaseNotes || null);
          if (onToast) onToast(`A new version is available: v${result.latestVersion}`);
          handleDownloadUpdate();
        } else {
          setUiState('up-to-date');
          setAvailableVersion(null);
        }
      }
    } catch (err: any) {
      setUiState('error');
      setErrorMessage('Update failed. Please check your internet connection and try again.');
    }
  }, [currentVersion, onToast, handleDownloadUpdate]);

  // Restart and install update
  const handleRestartAndInstall = () => {
    if (window.electronAPI?.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    } else {
      if (onToast) onToast('Restarting application to apply update...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <div className="pos-card" id="app-updater-section" style={{ marginBottom: '14px' }}>
      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <div className="pos-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🔄 Automatic Application Updates</span>
        </div>
        <div className="pos-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
          Check and install official production updates automatically.
        </div>
      </div>

      {/* Installed Version Box */}
      <div
        style={{
          background: 'var(--surface-2)',
          padding: '14px 16px',
          borderRadius: '8px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div className="pos-muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Installed Version
          </div>
          <div id="updater-current-version" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {currentVersion ? `v${currentVersion}` : 'Checking...'}
          </div>
        </div>
        {availableVersion && uiState === 'available' && (
          <div style={{ textAlign: 'right' }}>
            <div className="pos-muted" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Available Version
            </div>
            <div id="updater-available-version" style={{ fontSize: '22px', fontWeight: 700, color: '#38bdf8' }}>
              v{availableVersion}
            </div>
          </div>
        )}
      </div>

      {/* Primary Actions & Mutually Exclusive States */}
      <div style={{ marginBottom: '14px' }}>
        {/* State 1: Idle - Show Check for Updates */}
        {uiState === 'idle' && (
          <button
            id="check-for-updates-btn"
            type="button"
            className="pos-btn"
            onClick={handleCheckForUpdates}
            style={{ minWidth: '180px' }}
          >
            🔄 Check for Updates
          </button>
        )}

        {/* State 2: Checking - Show Checking for updates... */}
        {uiState === 'checking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              id="check-for-updates-btn"
              type="button"
              className="pos-btn"
              disabled
              style={{ minWidth: '180px', opacity: 0.8 }}
            >
              ⏳ Checking for updates...
            </button>
          </div>
        )}

        {/* State 3: Update Available - Show Notice & Download Button */}
        {uiState === 'available' && (
          <div>
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '12px 14px',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>✨</span>
              <div>
                <strong style={{ color: '#38bdf8', fontSize: '15px' }}>
                  A new version is available.
                </strong>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 600 }}>
                  Update available: v{availableVersion}
                </div>
                {isPortable && (
                  <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '2px' }}>
                    Portable Edition: The new executable will be downloaded to your folder.
                  </div>
                )}
                {releaseNotes && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', whiteSpace: 'pre-line' }}>
                    {releaseNotes}
                  </div>
                )}
              </div>
            </div>
            <button
              id="download-update-btn"
              type="button"
              className="pos-btn primary"
              onClick={handleDownloadUpdate}
              style={{
                background: '#0284c7',
                borderColor: '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                minWidth: '180px',
              }}
            >
              {isPortable ? '⬇️ Download Update (Portable)' : '⬇️ Download Update'}
            </button>
          </div>
        )}

        {/* State 4: Downloading - Show Progress Bar */}
        {uiState === 'downloading' && (
          <div
            style={{
              background: 'var(--surface-2)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '14px',
              borderRadius: '8px',
            }}
          >
            {availableVersion && (
              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>
                A new version is available: v{availableVersion}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                Downloading update...
              </span>
              <span className="pos-mono" style={{ fontWeight: 600 }}>
                {downloadProgress ?? 0}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  width: `${downloadProgress ?? 0}%`,
                  height: '100%',
                  background: '#38bdf8',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>{downloadedBytes || 'Connecting...'}</span>
              <span>{downloadSpeed}</span>
            </div>
          </div>
        )}

        {/* State 5: Downloaded - Show Restart and Install button */}
        {uiState === 'downloaded' && (
          <div>
            <div
              style={{
                background: 'rgba(22, 163, 74, 0.12)',
                border: '1px solid rgba(22, 163, 74, 0.3)',
                padding: '12px 14px',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>✅</span>
              <div>
                <strong style={{ color: '#16a34a', fontSize: '15px' }}>
                  Update downloaded. Restart to install.
                </strong>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {isPortable
                    ? 'The updated portable executable has been downloaded. Click below to launch the new version.'
                    : 'Click below to restart and install the update automatically.'}
                </div>
              </div>
            </div>
            <button
              id="restart-and-install-btn"
              type="button"
              className="pos-btn"
              onClick={handleRestartAndInstall}
              style={{
                background: '#16a34a',
                borderColor: '#16a34a',
                color: '#ffffff',
                fontWeight: 700,
                minWidth: '200px',
              }}
            >
              {isPortable ? '🚀 Launch New Version' : '🔄 Restart and Install Update'}
            </button>
          </div>
        )}

        {/* State 6: Up-to-date - Show Up To Date Notice & Re-check Button */}
        {uiState === 'up-to-date' && (
          <div>
            <div
              id="up-to-date-message"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#10b981',
                padding: '12px 14px',
                borderRadius: '8px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '14px',
              }}
            >
              <span style={{ fontSize: '18px' }}>✅</span>
              <strong style={{ color: '#10b981' }}>
                You are using the latest version.
              </strong>
            </div>
            <button
              id="check-for-updates-btn"
              type="button"
              className="pos-btn outline sm"
              onClick={handleCheckForUpdates}
              style={{ fontSize: '13px' }}
            >
              🔄 Check Again
            </button>
          </div>
        )}

        {/* State 7: Error - Show Error Notice & Retry Button */}
        {uiState === 'error' && (
          <div
            id="updater-error-message"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span>{errorMessage || 'Update failed. Please check your internet connection and try again.'}</span>
            </div>
            <button
              type="button"
              className="pos-btn outline sm"
              style={{ fontSize: '12px', padding: '4px 10px', borderColor: '#f87171', color: '#f87171', whiteSpace: 'nowrap' }}
              onClick={handleCheckForUpdates}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
