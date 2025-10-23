import React from 'react';
import type { RecommendedPlace } from '../types';

interface MapViewProps {
    place: RecommendedPlace | null;
}

export const MapView: React.FC<MapViewProps> = ({ place }) => {
    if (!place) {
        return (
            <div className="w-full h-64 sm:h-80 md:h-96 rounded-xl border border-slate-700 mb-6 bg-slate-800 flex items-center justify-center">
                <p className="text-slate-400">목록에 마우스를 올려 지도에서 위치를 확인하세요.</p>
            </div>
        );
    }

    const { latitude, longitude } = place;
    // Zoom level 15 is good for a specific address/place.
    const mapSrc = `https://www.google.com/maps/embed/v1/view?center=${latitude},${longitude}&zoom=15`;

    return (
        <div className="w-full h-64 sm:h-80 md:h-96 rounded-xl overflow-hidden border border-slate-700 mb-6 shadow-lg">
            <iframe
                key={place.googleMapsUrl} // Force iframe to re-render when place changes
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={mapSrc}
            ></iframe>
        </div>
    );
};
