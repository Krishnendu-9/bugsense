import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export default function StepsReproducer({ value = [], onChange }) {
  const [draft, setDraft] = useState('');

  const addStep = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setDraft('');
  };

  const removeStep = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateStep = (index, text) => {
    const updated = [...value];
    updated[index] = text;
    onChange(updated);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addStep();
    }
  };

  return (
    <div className="space-y-2">
      {value.map((step, index) => (
        <div key={index} className="flex items-center gap-2 group">
          <div className="flex-shrink-0 text-muted cursor-grab">
            <GripVertical size={16} />
          </div>
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
            {index + 1}
          </span>
          <input
            type="text"
            value={step}
            onChange={(e) => updateStep(index, e.target.value)}
            className="input-field flex-1 py-1.5 text-sm"
            placeholder={`Step ${index + 1}`}
          />
          <button
            type="button"
            onClick={() => removeStep(index)}
            className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-priority-high hover:bg-priority-high/10 transition-colors duration-200 opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-4" />
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 text-muted text-xs flex items-center justify-center font-medium border border-dashed border-border">
          {value.length + 1}
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="input-field flex-1 py-1.5 text-sm"
          placeholder="Add a reproduction step and press Enter..."
        />
        <button
          type="button"
          onClick={addStep}
          disabled={!draft.trim()}
          className="flex-shrink-0 p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors duration-200 disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
