import type { FC } from 'react';
import type { Point } from '../hooks/useGazeTracker';
import './GazeCursor.css';

interface GazeCursorProps {
  position: Point;
  visible: boolean;
}

const GazeCursor: FC<GazeCursorProps> = ({ position, visible }) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="gaze-cursor"
      style={{
        transform: `translate(calc(${position.x * 100}% - 1.5rem), calc(${position.y * 100}% - 1.5rem))`,
      }}
      aria-hidden="true"
    />
  );
};

export default GazeCursor;
