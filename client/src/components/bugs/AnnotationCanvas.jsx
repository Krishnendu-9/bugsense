import { useEffect, useRef, useState } from 'react';
import { Pencil, Square, Circle, Minus, RotateCcw, Download, Palette } from 'lucide-react';

const TOOLS = [
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Ellipse' },
];

const COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#6366F1', '#F1F5F9', '#000000'];

export default function AnnotationCanvas({ imageUrl, onSave }) {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeColor, setActiveColor] = useState('#EF4444');
  const [fabricReady, setFabricReady] = useState(false);

  useEffect(() => {
    let canvas;
    import('fabric').then(({ fabric }) => {
      if (!canvasRef.current || fabricRef.current) return;

      canvas = new fabric.Canvas(canvasRef.current, {
        width: 800,
        height: 500,
        backgroundColor: '#1E293B',
      });
      fabricRef.current = canvas;

      if (imageUrl) {
        // crossOrigin is required: once the screenshot is served from the API
        // origin rather than the app origin, an unqualified load taints the
        // canvas and toDataURL() throws a SecurityError on save.
        fabric.Image.fromURL(
          imageUrl,
          (img) => {
            if (!img) return;
            img.scaleToWidth(800);
            canvas.setHeight(img.getScaledHeight());
            canvas.add(img);
            img.sendToBack();
            canvas.renderAll();
          },
          { crossOrigin: 'anonymous' }
        );
      }

      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = '#EF4444';
      canvas.freeDrawingBrush.width = 3;

      setFabricReady(true);
    });

    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricReady) return;

    canvas.isDrawingMode = activeTool === 'pencil';
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = 3;
    }

    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');

    if (activeTool !== 'pencil') {
      canvas.selection = false;
      let isDown = false;
      let origX, origY;
      let shape;

      canvas.on('mouse:down', (opt) => {
        isDown = true;
        const pointer = canvas.getPointer(opt.e);
        origX = pointer.x;
        origY = pointer.y;

        import('fabric').then(({ fabric }) => {
          if (activeTool === 'rect') {
            shape = new fabric.Rect({
              left: origX, top: origY,
              width: 0, height: 0,
              stroke: activeColor, strokeWidth: 2,
              fill: 'transparent', selectable: false,
            });
          } else if (activeTool === 'circle') {
            shape = new fabric.Ellipse({
              left: origX, top: origY,
              rx: 0, ry: 0,
              stroke: activeColor, strokeWidth: 2,
              fill: 'transparent', selectable: false,
            });
          } else if (activeTool === 'line') {
            shape = new fabric.Line([origX, origY, origX, origY], {
              stroke: activeColor, strokeWidth: 2, selectable: false,
            });
          }
          if (shape) canvas.add(shape);
        });
      });

      canvas.on('mouse:move', (opt) => {
        if (!isDown || !shape) return;
        const pointer = canvas.getPointer(opt.e);
        if (activeTool === 'rect') {
          if (pointer.x < origX) shape.set({ left: pointer.x });
          if (pointer.y < origY) shape.set({ top: pointer.y });
          shape.set({ width: Math.abs(pointer.x - origX), height: Math.abs(pointer.y - origY) });
        } else if (activeTool === 'circle') {
          shape.set({ rx: Math.abs(pointer.x - origX) / 2, ry: Math.abs(pointer.y - origY) / 2 });
        } else if (activeTool === 'line') {
          shape.set({ x2: pointer.x, y2: pointer.y });
        }
        canvas.renderAll();
      });

      canvas.on('mouse:up', () => { isDown = false; shape = null; });
    } else {
      canvas.selection = true;
    }
  }, [activeTool, activeColor, fabricReady]);

  const handleUndo = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
      canvas.renderAll();
    }
  };

  const handleSave = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
    if (onSave) onSave(dataUrl);
  };

  const handleDownload = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `annotation-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => setActiveTool(id)}
              className={`p-2 rounded-md transition-colors duration-200 ${
                activeTool === id
                  ? 'bg-primary text-white'
                  : 'text-muted hover:text-text-base hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
          <Palette size={14} className="text-muted ml-1" />
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setActiveColor(color)}
              className={`w-5 h-5 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                activeColor === color ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={handleUndo} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
            <RotateCcw size={14} /> Undo
          </button>
          <button type="button" onClick={handleDownload} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
            <Download size={14} /> Download
          </button>
          {onSave && (
            <button type="button" onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
              Save Annotation
            </button>
          )}
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
