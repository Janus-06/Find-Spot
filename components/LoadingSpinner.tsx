import React from 'react';

interface LoadingSpinnerProps {
    message: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
       <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
       <p className="text-slate-300 text-center">{message}</p>
    </div>
  );
};