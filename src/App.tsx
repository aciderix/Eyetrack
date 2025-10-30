import type { FC } from 'react';
import { useCallback } from 'react';
import CalibrationPanel from './components/CalibrationPanel';
import GazeCursor from './components/GazeCursor';
import TrackerStatusPanel from './components/TrackerStatus';
import { useGazeTracker } from './hooks/useGazeTracker';
import './styles/App.css';

const App: FC = () => {
  const {
    videoRef,
    canvasRef,
    pointer,
    pointerVisible,
    setPointerVisible,
    isActive,
    start,
    stop,
    calibration,
    status,
  } = useGazeTracker();

  const handleTogglePointer = useCallback(() => {
    setPointerVisible(!pointerVisible);
  }, [pointerVisible, setPointerVisible]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Eyetrack</h1>
          <p>
            Contrôlez une interface avec votre regard grâce à la webcam de votre appareil. L'étalonnage rapide et les
            compensations automatiques des mouvements de tête garantissent une navigation stable, même en cas de
            rotation, d'inclinaison ou de déplacement.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary" onClick={start} disabled={isActive}>
            Activer le suivi
          </button>
          <button type="button" className="secondary" onClick={stop} disabled={!isActive}>
            Arrêter
          </button>
          <label className="toggle">
            <input type="checkbox" checked={pointerVisible} onChange={handleTogglePointer} />
            <span>Afficher le curseur de regard</span>
          </label>
        </div>
      </header>

      <main className="app-main">
        <section className="visualisation" aria-label="Flux vidéo avec suivi du regard">
          <div className="video-container">
            <video ref={videoRef} autoPlay muted playsInline className="video-feed" />
            <canvas ref={canvasRef} className="overlay" aria-hidden="true" />
            {pointer && <GazeCursor position={pointer} visible={pointerVisible} />}

            {calibration.state.mode === 'running' && (
              <div className="calibration-overlay" aria-hidden="true">
                {calibration.targets.map((target, index) => (
                  <div
                    key={target.id}
                    className={`overlay-target ${
                      calibration.state.currentIndex === index ? 'active' : ''
                    }`}
                    style={{
                      left: `${target.position.x * 100}%`,
                      top: `${target.position.y * 100}%`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="control-panel">
          <TrackerStatusPanel status={status} isActive={isActive} />
          <CalibrationPanel
            state={calibration.state}
            targets={calibration.targets}
            onStart={calibration.start}
            onCancel={calibration.cancel}
            onCapture={calibration.capture}
          />
          <section className="accessibility-tips">
            <h2>Conseils d'accessibilité</h2>
            <ul>
              <li>Utilisez un support pour stabiliser votre appareil si vous avez des tremblements.</li>
              <li>Réglez l'éclairage pour éviter les reflets sur les lunettes ou la fatigue visuelle.</li>
              <li>Pendant l'étalonnage, une synthèse vocale peut lire les instructions via votre lecteur d'écran.</li>
              <li>Le curseur reste visible même en cas de rotation ou d'inclinaison grâce aux corrections automatiques.</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
};

export default App;
