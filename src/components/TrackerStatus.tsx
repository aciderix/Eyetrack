import type { FC } from 'react';
import type { TrackerStatus } from '../hooks/useGazeTracker';
import './TrackerStatus.css';

interface TrackerStatusProps {
  status: TrackerStatus;
  isActive: boolean;
}

const StatusBadge: FC<{ active: boolean; label: string }> = ({ active, label }) => (
  <span className={`status-badge ${active ? 'active' : ''}`}>{label}</span>
);

const TrackerStatusPanel: FC<TrackerStatusProps> = ({ status, isActive }) => (
  <section className="tracker-status" aria-live="polite">
    <div className="status-header">
      <h2>Statut du suivi</h2>
      <StatusBadge active={isActive} label={isActive ? 'Actif' : 'Arrêté'} />
    </div>
    <ul>
      <li>
        <StatusBadge active={status.permissionGranted} label={status.permissionGranted ? 'Caméra autorisée' : 'Autorisation requise'} />
      </li>
      <li>
        <StatusBadge active={status.cameraReady} label={status.cameraReady ? 'Flux vidéo prêt' : 'Flux indisponible'} />
      </li>
      <li>
        <StatusBadge active={status.trackerReady} label={status.trackerReady ? 'Visage détecté' : 'Visage absent'} />
      </li>
    </ul>
    <p className="status-message">{status.message}</p>
  </section>
);

export default TrackerStatusPanel;
