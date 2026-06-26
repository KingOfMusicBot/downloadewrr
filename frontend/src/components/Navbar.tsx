'use client';

import React from 'react';
import Link from 'next/link';
import { Video } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <nav className="glass-panel border-b border-border sticky top-0 z-50 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="p-2 gradient-bg rounded-lg text-white shadow-md shadow-primary/20">
                <Video className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
              </div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                Prime Downloader
              </span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};
