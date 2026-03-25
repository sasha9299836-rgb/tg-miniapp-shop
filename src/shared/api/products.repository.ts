import type { Product } from "../types/product";

export interface ProductsRepository {
  getAll(): Promise<Product[]>;
  getById(id: number): Promise<Product | null>;
}
