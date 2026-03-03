export interface Nutrient {
  id: number;
  name: string;
  amount_per_100g: number;
  unit: string;
}

export interface Item {
  id: number;
  name: string;
  scientific_name?: string;
  category: string;
  calories_per_100g: number;
  season: string;
  image_url?: string;
  nutrients?: Nutrient[];
}
