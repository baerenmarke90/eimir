/* The scene with a static sheet: the reference for the bundle delta. */
import { useEffect, useRef } from 'react';
import { mountScene, SheetContent } from './scene';

function StaticSheet() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.dataset.ready = '';
  }, []);
  return (
    <div className="sheet" data-sheet ref={ref}>
      <SheetContent />
    </div>
  );
}

mountScene(<StaticSheet />);
