import React, { useState } from 'react';
import { addCustomCategory } from '../lib/db';
import { Plus } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function AddCategoryForm({ onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    try {
      await addCustomCategory({
        title: title.trim(),
        description: description.trim(),
        iconName: 'FolderPlus', // default icon
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-sm text-left">
      <h3 className="text-xl font-bold text-slate-800 mb-4">Neuen Themenbereich erstellen</h3>
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Titel</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="z.B. Chemie"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung</label>
          <input
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Kurze Beschreibung des Themas..."
          />
        </div>
      </div>
      
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl">
          Abbrechen
        </button>
        <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm flex items-center gap-2">
          <Plus size={18} /> Speichern
        </button>
      </div>
    </form>
  );
}
