// lib/utils/spaceIconMatcher.ts
import {
  Wine,
  Plane,
  Dumbbell,
  Briefcase,
  Heart,
  Home,
  GraduationCap,
  DollarSign,
  Baby,
  Utensils,
  Book,
  Music,
  Camera,
  Car,
  Dog,
  Leaf,
  Calendar,
  Target,
  Folder, // default fallback
} from 'lucide-react-native';

const ICON_KEYWORDS: Record<string, typeof Folder> = {
  // Health & Wellness
  alcohol: Wine,
  drink: Wine,
  sober: Wine,
  fitness: Dumbbell,
  gym: Dumbbell,
  workout: Dumbbell,
  health: Dumbbell,
  exercise: Dumbbell,

  // Travel
  honeymoon: Plane,
  travel: Plane,
  vacation: Plane,
  trip: Plane,

  // Work & Finance
  work: Briefcase,
  job: Briefcase,
  career: Briefcase,
  money: DollarSign,
  budget: DollarSign,
  savings: DollarSign,
  finance: DollarSign,

  // Relationships & Family
  wedding: Heart,
  relationship: Heart,
  dating: Heart,
  baby: Baby,
  pregnancy: Baby,
  family: Home,
  house: Home,
  moving: Home,

  // Learning
  learn: GraduationCap,
  study: GraduationCap,
  course: GraduationCap,
  school: GraduationCap,

  // Hobbies
  food: Utensils,
  cooking: Utensils,
  diet: Utensils,
  reading: Book,
  book: Book,
  music: Music,
  photo: Camera,
  car: Car,
  pet: Dog,
  dog: Dog,
  cat: Dog,
  garden: Leaf,
  plant: Leaf,

  // Goals
  goal: Target,
  resolution: Target,
  habit: Calendar,
};

export function getSpaceIcon(spaceName: string): typeof Folder {
  const lowerName = spaceName.toLowerCase();

  for (const [keyword, icon] of Object.entries(ICON_KEYWORDS)) {
    if (lowerName.includes(keyword)) {
      return icon;
    }
  }

  return Folder; // Default fallback
}
