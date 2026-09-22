import { useEffect, useRef, useState } from 'react';
import { Pencil, Square, Circle, Minus, RotateCcw, Download, Palette } from 'lucide-react';
import toast from 'react-hot-toast';

const TOOLS = [
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Ellipse' },
];

const COLORS = ['#EF4444', '#F59E0B', '#22C55E', '#6366F1', '#F1F5F9', '#000000'];

const CANVAS_WIDTH = 800;
const STROKE_WIDTH = 3;

// Fabric 7 positions objects by their centre by default; drawing from the
// pointer is far simpler with a top-left origin.
const TOP_LEFT = { originX: 'left', originY: 'top' };

export default function AnnotationCanvas({ imageUrl, onSave }) {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  // The fabric module is loaded lazily (it is large) and kept here so event
  // handlers can use it synchronously.
  const fabricModRef = useRef(null);
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeColor, setActiveColor] = useState('#EF4444');
  const [fabricReady, setFabricReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let canvas;

    import('fabric').then(async (fabric) => {
      if (disposed || !canvasRef.current) return;
      fabricModRef.current = fabric;

      canvas = new fabric.Canvas(canvasRef.current, {
        width: CANVAS_WIDTH,
        height: 500,
        backgroundColor: '#1E293B',
      });
      fabricCanvasRef.current = canvas;

      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = STROKE_WIDTH;
      canvas.isDrawingMode = true;

      if (imageUrl) {
        try {
          // crossOrigin is required: the screenshot is served from the API
          // origin, and an unqualified load taints the canvas so toDataURL()
          // throws a SecurityError on save.
          const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
          if (disposed) return;
          img.scaleToWidth(CANVAS_WIDTH);
          img.set({ ...TOP_LEFT, left: 0, top: 0, selectable: false, evented: false });
          canvas.setDimensions({ height: Math.round(img.getScaledHeight()) });
          canvas.add(img);
          canvas.sendObjectToBack(img);
          canvas.requestRenderAll();
        } catch {
          toast.error('Could not load the screenshot for annotation');
        }
      }

      if (!disposed) setFabricReady(true);
    });

    return () => {
      disposed = true;
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const fabric = fabricModRef.current;
    if (!canvas || !fabric || !fabricReady) return undefined;

    canvas.isDrawingMode = activeTool === 'pencil';
    canvas.freeDrawingBrush.color = activeColor;
    canvas.selection = activeTool === 'pencil';

    if (activeTool === 'pencil') return undefined;

    let origin = null;
    let shape = null;

    const onDown = (opt) => {
      const { x, y } = opt.scenePoint;
      origin = { x, y };
      const stroke = { stroke: activeColor, strokeWidth: STROKE_WIDTH, fill: 'transparent', selectable: false };

      if (activeTool === 'rect') {
        shape = new fabric.Rect({ ...TOP_LEFT, ...stroke, left: x, top: y, width: 0, height: 0 });
      } else if (activeTool === 'circle') {
        shape = new fabric.Ellipse({ ...TOP_LEFT, ...stroke, left: x, top: y, rx: 0, ry: 0 });
      } else if (activeTool === 'line') {
        shape = new fabric.Line([x, y, x, y], { ...stroke, strokeLineCap: 'round' });
      }
      if (shape) canvas.add(shape);
    };

    const onMove = (opt) => {
      if (!origin || !shape) return;
      const { x, y } = opt.scenePoint;

      if (activeTool === 'rect') {
        shape.set({
          left: Math.min(x, origin.x),
          top: Math.min(y, origin.y),
          width: Math.abs(x - origin.x),
          height: Math.abs(y - origin.y),
        });
      } else if (activeTool === 'circle') {
        // Drawn inside the dragged box, in whichever direction the drag goes.
        shape.set({
          left: Math.min(x, origin.x),
          top: Math.min(y, origin.y),
          rx: Math.abs(x - origin.x) / 2,
          ry: Math.abs(y - origin.y) / 2,
        });
      } else if (activeTool === 'line') {
        shape.set({ x2: x, y2: y });
      }
      shape.setCoords();
      canvas.requestRenderAll();
    };

    const onUp = () => {
      // A click without a drag leaves an invisible zero-size shape behind.
      if (shape && shape.width < 2 && shape.height < 2) canvas.remove(shape);
      origin = null;
      shape = null;
    };

    canvas.on('mouse:down', onDown);
    canvas.on('mouse:move', onMove);
    canvas.on('mouse:up', onUp);

    return () => {
      canvas.off('mouse:down', onDown);
      canvas.off('mouse:move', onMove);
      canvas.off('mouse:up', onUp);
    };
  }, [activeTool, activeColor, fabricReady]);

  // Removes the most recent annotation, never the screenshot underneath.
  const handleUndo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects().filter((obj) => obj.type !== 'image');
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
      canvas.requestRenderAll();
    }
  };

  const exportImage = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL({ format: 'png', multiplier: 1 });
    } catch {
      toast.error('This image cannot be exported (it was loaded from another origin)');
      return null;
    }
  };

  const handleSave = () => {
    const dataUrl = exportImage();
    if (dataUrl && onSave) onSave(dataUrl);
  };

  const handleDownload = () => {
    const dataUrl = exportImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `annotation-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={activeTool === id}
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

        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border" role="toolbar" aria-label="Colors">
          <Palette size={14} className="text-muted ml-1" />
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              aria-pressed={activeColor === color}
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

      <div className="border border-border rounded-xl overflow-auto max-w-full">
        {!fabricReady && <div className="skeleton h-[500px] w-[800px] max-w-full" />}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
