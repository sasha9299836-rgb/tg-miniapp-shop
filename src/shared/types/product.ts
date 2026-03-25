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
  defectImages?: string[];
  saleStatus?: "available" | "reserved" | "sold";
};
