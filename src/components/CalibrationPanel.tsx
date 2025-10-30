import type { FC } from 'react';
import { useEffect } from 'react';
import type { CalibrationState, CalibrationTarget } from '../hooks/useGazeTracker';
import './CalibrationPanel.css';

interface CalibrationPanelProps {
  state: CalibrationState;
  targets: CalibrationTarget[];
  onStart: () => void;
  onCancel: () => void;
  onCapture: () => void;
}

const CalibrationPanel: FC<CalibrationPanelProps> = ({
  state,
  targets,
  onStart,
  onCancel,
  onCapture,
}) => {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (state.mode !== 'running') {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onCapture();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [state.mode, onCapture, onCancel]);

  const activeTarget = targets[state.currentIndex];

  return (
    <section className="calibration-panel" aria-labelledby="calibration-title">
      <div className="calibration-header">
        <h2 id="calibration-title">Étalonnage</h2>
        <p className="calibration-instructions">{state.instructions}</p>
      </div>

      {state.lastError ? <p className="calibration-error">{state.lastError}</p> : null}

      <div className="calibration-actions">
        {state.mode !== 'running' ? (
          <button type="button" className="primary" onClick={onStart}>
            Démarrer l'étalonnage ({state.total} points)
          </button>
        ) : (
          <div className="running-actions">
            <button type="button" className="primary" onClick={onCapture}>
              Valider le point ({state.currentIndex + 1}/{state.total})
            </button>
            <button type="button" onClick={onCancel} className="secondary">
              Annuler
            </button>
          </div>
        )}
      </div>

      <div className="calibration-grid" role="presentation">
        {targets.map((target) => (
          <div
            key={target.id}
            className={`calibration-dot ${
              state.mode === 'running' && activeTarget?.id === target.id ? 'active' : ''
            }`}
            aria-hidden="true"
          />
        ))}
      </div>

      <p className="calibration-helper">
        Astuce : alignez votre tête avec le point et maintenez votre regard fixe. Utilisez la barre d'espace
        ou Entrée pour valider. Échap permet d'annuler.
      </p>
    </section>
  );
};

export default CalibrationPanel;
