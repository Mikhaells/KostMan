import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { fileUrl, uploadFile } from '../../lib/api'
import { toast } from '../../lib/toast'
import { cn } from './index'

export default function ImagePicker({
  value, onChange, max = 10, label = 'Foto',
}: {
  value: string[]
  onChange: (urls: string[]) => void
  max?: number
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const remaining = max - value.length
    if (remaining <= 0) {
      toast(`Maksimal ${max} foto`, 'error')
      return
    }
    setUploading(true)
    try {
      const selected = Array.from(files).slice(0, remaining)
      const urls = await Promise.all(selected.map(uploadFile))
      onChange([...value, ...urls])
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Gagal mengunggah foto', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <span className="field-label">{label} ({value.length}/{max})</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src={fileUrl(url)} alt="Foto" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== url))}
              className="absolute right-0 top-0 rounded-bl-lg bg-slate-900/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
              aria-label="Hapus foto"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn('grid h-20 w-20 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500')}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
    </div>
  )
}
