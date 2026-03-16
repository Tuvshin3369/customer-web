import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="sticky top-[57px] z-40 bg-white border-b border-gray-100">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Хайх бараагаа бичнэ үү..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-lg border-0 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
        </div>
      </div>
    </div>
  );
}
