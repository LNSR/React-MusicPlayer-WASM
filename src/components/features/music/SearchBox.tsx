import { Search } from 'lucide-react'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  className?: React.HTMLAttributes<HTMLLabelElement>['className']
}

export function SearchBox({ value, onChange, className }: SearchBoxProps) {
  return (
    <label
      className={`music-search-box ${className ?? ''}`}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search songs"
        className="music-search-input"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="music-search-clear"
        >
          Clear
        </button>
      ) : null}
    </label>
  )
}
