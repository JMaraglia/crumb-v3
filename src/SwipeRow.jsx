// file: src/SwipeRow.jsx
// Swipe a row left to show a red button (Delete / Remove); swipe all the way to do it right away.
// Same swipe as the To-Do page (that one works on iPhone), shared so other lists can use it.
import React, { useRef, useState } from 'react';
import './SwipeRow.css';

const BUTTON_W = 88;
const FULL_SWIPE = -200;

export default function SwipeRow({ className = '', wrapClassName = '', label = 'Delete', onDelete, children }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const base = useRef(0);
  const moved = useRef(false);
  const xNow = useRef(0);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const setPos = (v) => {
    xNow.current = v;
    setX(v);
  };

  // Returns true when this is a sideways swipe.
  const begin = (cx, cy) => {
    start.current = { x: cx, y: cy };
    base.current = xNow.current;
    moved.current = false;
  };
  const drag = (cx, cy) => {
    if (!start.current) return false;
    const dx = cx - start.current.x;
    const dy = cy - start.current.y;
    if (!moved.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return false;
      if (Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // scrolling up/down, not a swipe
        return false;
      }
      moved.current = true;
      setDragging(true);
    }
    setPos(Math.min(0, Math.max(-360, base.current + dx)));
    return true;
  };
  const end = async () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (!moved.current) return;
    if (xNow.current < FULL_SWIPE) {
      setPos(0);
      await onDeleteRef.current(); // swiped all the way
    } else {
      setPos(xNow.current < -BUTTON_W / 2 ? -BUTTON_W : 0);
    }
  };

  const pDown = (e) => begin(e.clientX, e.clientY);
  const pMove = (e) => drag(e.clientX, e.clientY);
  const pUp = () => end();

  // After a swipe, or while the button is showing, a tap just closes the row.
  const clickCapture = (e) => {
    if (moved.current || xNow.current !== 0) {
      e.stopPropagation();
      e.preventDefault();
      moved.current = false;
      if (xNow.current !== 0) setPos(0);
    }
  };

  return (
    <div className={`sw-wrap ${wrapClassName}`}>
      <button
        className="sw-del"
        style={{ visibility: x < 0 || dragging ? 'visible' : 'hidden' }}
        onClick={async () => {
          setPos(0);
          await onDeleteRef.current();
        }}
        aria-label={label}
      >
        {label}
      </button>
      <div
        className={`sw-row ${className}`}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={pDown}
        onPointerMove={pMove}
        onPointerUp={pUp}
        onPointerCancel={pUp}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
    </div>
  );
}
