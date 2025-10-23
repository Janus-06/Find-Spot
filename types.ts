export interface RecommendedPlace {
  placeName: string;
  description: string;
  googleMapsUrl: string;
  highlights: string[];
  reviewUrl?: string;
  latitude: number;
  longitude: number;
  distance?: string;
}

export interface Recommendation {
  places: RecommendedPlace[];
}

export interface UserProfile {
  tags: string[];
  description: string;
}

export interface PlaceDetails {
  openingHours: string;
  popularAmenities?: string[];
  popularDishes?: string[];
}