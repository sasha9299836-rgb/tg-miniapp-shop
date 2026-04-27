export type DefectMediaItem = {
  type: "image" | "video";
  url: string;
  posterUrl?: string;
};

export type Product = {
  id: number;
  postId?: string;
  title: string;
  price: number;
  oldPrice?: number;
  images: string[];
  isNew: boolean;
  description?: string;
  brand?: string | null;
  subtitle?: string | null;
  size?: string | null;
  condition?: string | null;
  hasDefects?: boolean;
  defectsText?: string | null;
  defectMedia?: DefectMediaItem[];
  defectImages?: string[];
  videoUrl?: string | null;
  measurementsText?: string | null;
  measurementPhotos?: string[];
  is_in_update?: boolean;
  is_in_update_expires_at?: string | null;
  saleStatus?: "available" | "reserved" | "sold";
};
