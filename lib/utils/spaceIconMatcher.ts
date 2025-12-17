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
  Folder,
  Brain,
  Pill,
  Moon,
  Sun,
  Coffee,
  Cigarette,
  Gamepad2,
  Tv,
  Monitor,
  Smartphone,
  Laptop,
  Code,
  Palette,
  PenTool,
  Scissors,
  Hammer,
  Wrench,
  ShoppingBag,
  ShoppingCart,
  Gift,
  CreditCard,
  PiggyBank,
  TrendingUp,
  BarChart,
  Building2,
  Users,
  UserPlus,
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  Mountain,
  Bike,
  Footprints,
  Timer,
  Shirt,
  Sparkles,
  Stethoscope,
  Scale,
  Apple,
  Salad,
  Cookie,
  Pizza,
  Guitar,
  Mic,
  Headphones,
  Film,
  Clapperboard,
  FileText,
  Languages,
  Compass,
  Church,
  Star,
  Flame,
  Zap,
  CloudRain,
  Snowflake,
  TreeDeciduous,
  Flower2,
  Bird,
  Cat,
  Rabbit,
  Fish,
  Bus,
  Train,
  Ship,
  Award,
  Trophy,
  Medal,
  PartyPopper,
  Cake,
  Lock,
  Shield,
  Lightbulb,
  Podcast,
  Video,
  Tent,
  Backpack,
  Anchor,
  Waves,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react-native';

type IconComponent = LucideIcon;

const ICON_KEYWORDS: Record<string, IconComponent> = {
  // ===== HEALTH & WELLNESS =====
  alcohol: Wine,
  drinking: Wine,
  drunk: Wine,
  sober: Wine,
  sobriety: Wine,
  booze: Wine,
  beer: Wine,
  wine: Wine,
  cocktail: Wine,
  bar: Wine,

  fitness: Dumbbell,
  gym: Dumbbell,
  workout: Dumbbell,
  exercise: Dumbbell,
  training: Dumbbell,
  weights: Dumbbell,
  lifting: Dumbbell,
  crossfit: Dumbbell,
  muscle: Dumbbell,
  strength: Dumbbell,

  mental: Brain,
  mindful: Brain,
  meditation: Brain,
  therapy: Brain,
  anxiety: Brain,
  stress: Brain,
  focus: Brain,
  adhd: Brain,
  brain: Brain,
  cognitive: Brain,

  sleep: Moon,
  insomnia: Moon,
  rest: Moon,
  nap: Moon,
  bedtime: Moon,
  dream: Moon,

  morning: Sun,
  wakeup: Sun,
  sunrise: Sun,

  medicine: Pill,
  medication: Pill,
  supplement: Pill,
  vitamin: Pill,
  prescription: Pill,

  smoking: Cigarette,
  cigarette: Cigarette,
  vaping: Cigarette,
  tobacco: Cigarette,
  nicotine: Cigarette,
  quit: Cigarette,

  doctor: Stethoscope,
  medical: Stethoscope,
  checkup: Stethoscope,
  appointment: Stethoscope,

  weight: Scale,
  diet: Scale,
  calories: Scale,
  pounds: Scale,
  keto: Scale,
  fasting: Scale,

  // ===== FOOD & NUTRITION =====
  food: Utensils,
  eating: Utensils,
  cooking: Utensils,
  recipe: Utensils,
  meal: Utensils,
  kitchen: Utensils,
  chef: Utensils,

  coffee: Coffee,
  caffeine: Coffee,
  espresso: Coffee,
  latte: Coffee,

  healthy: Apple,
  fruit: Apple,
  nutrition: Apple,

  vegetarian: Salad,
  vegan: Salad,
  salad: Salad,
  greens: Salad,

  snack: Cookie,
  sugar: Cookie,
  sweets: Cookie,
  dessert: Cookie,
  candy: Cookie,

  pizza: Pizza,
  takeout: Pizza,
  delivery: Pizza,

  // ===== TRAVEL & ADVENTURE =====
  honeymoon: Plane,
  travel: Plane,
  vacation: Plane,
  trip: Plane,
  flight: Plane,
  airport: Plane,
  abroad: Plane,
  international: Plane,

  hiking: Mountain,
  climbing: Mountain,
  mountain: Mountain,
  outdoor: Mountain,
  nature: Mountain,
  trail: Mountain,

  camping: Tent,
  tent: Tent,
  backpacking: Backpack,

  beach: Waves,
  ocean: Waves,
  swim: Waves,
  surf: Waves,
  pool: Waves,

  sailing: Anchor,
  boat: Ship,
  cruise: Ship,

  bike: Bike,
  cycling: Bike,
  biking: Bike,
  bicycle: Bike,

  running: Footprints,
  marathon: Footprints,
  jogging: Footprints,
  walk: Footprints,
  steps: Footprints,

  road: Car,
  driving: Car,
  car: Car,
  vehicle: Car,

  commute: Train,
  transit: Bus,

  // ===== WORK & CAREER =====
  work: Briefcase,
  job: Briefcase,
  career: Briefcase,
  professional: Briefcase,
  office: Briefcase,
  corporate: Briefcase,

  business: Building2,
  startup: Building2,
  company: Building2,
  entrepreneur: Building2,
  founder: Building2,

  meeting: Users,
  team: Users,
  collaboration: Users,
  coworker: Users,

  interview: UserPlus,
  hiring: UserPlus,
  recruit: UserPlus,

  presentation: BarChart,
  analytics: BarChart,
  metrics: BarChart,
  kpi: BarChart,

  // ===== FINANCE & MONEY =====
  money: DollarSign,
  income: DollarSign,
  salary: DollarSign,
  raise: DollarSign,

  budget: PiggyBank,
  savings: PiggyBank,
  saving: PiggyBank,
  emergency: PiggyBank,

  invest: TrendingUp,
  stocks: TrendingUp,
  crypto: TrendingUp,
  portfolio: TrendingUp,
  retirement: TrendingUp,
  '401k': TrendingUp,

  debt: CreditCard,
  credit: CreditCard,
  loan: CreditCard,
  mortgage: CreditCard,
  payment: CreditCard,

  shopping: ShoppingBag,
  spending: ShoppingCart,
  purchase: ShoppingCart,

  // ===== RELATIONSHIPS & FAMILY =====
  wedding: Heart,
  relationship: Heart,
  dating: Heart,
  love: Heart,
  marriage: Heart,
  partner: Heart,
  spouse: Heart,
  boyfriend: Heart,
  girlfriend: Heart,
  romance: Heart,
  anniversary: Heart,

  baby: Baby,
  pregnancy: Baby,
  pregnant: Baby,
  newborn: Baby,
  infant: Baby,
  toddler: Baby,
  parenting: Baby,

  family: Home,
  house: Home,
  home: Home,
  moving: Home,
  apartment: Home,
  rent: Home,
  roommate: Home,

  friends: Users,
  social: Users,
  networking: Users,
  community: Users,

  communication: MessageCircle,
  texting: MessageCircle,
  conversation: MessageCircle,

  calling: Phone,
  phone: Phone,

  email: Mail,
  inbox: Mail,

  // ===== EDUCATION & LEARNING =====
  learn: GraduationCap,
  study: GraduationCap,
  course: GraduationCap,
  school: GraduationCap,
  college: GraduationCap,
  university: GraduationCap,
  degree: GraduationCap,
  exam: GraduationCap,
  test: GraduationCap,
  certification: GraduationCap,

  reading: Book,
  book: Book,
  library: Book,
  novel: Book,
  literature: Book,

  writing: PenTool,
  journal: PenTool,
  diary: PenTool,
  blog: PenTool,
  author: PenTool,

  language: Languages,
  spanish: Languages,
  french: Languages,
  german: Languages,
  chinese: Languages,
  japanese: Languages,
  korean: Languages,
  italian: Languages,
  portuguese: Languages,

  research: FileText,
  thesis: FileText,
  paper: FileText,

  // ===== TECHNOLOGY & DIGITAL =====
  coding: Code,
  programming: Code,
  developer: Code,
  software: Code,
  app: Code,
  website: Code,
  tech: Code,

  computer: Monitor,
  desktop: Monitor,
  pc: Monitor,

  laptop: Laptop,
  macbook: Laptop,

  iphone: Smartphone,
  android: Smartphone,
  screen: Smartphone,
  digital: Smartphone,

  gaming: Gamepad2,
  games: Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  nintendo: Gamepad2,

  streaming: Tv,
  netflix: Tv,
  television: Tv,
  shows: Tv,
  series: Tv,

  youtube: Video,
  content: Video,
  creator: Video,
  vlog: Video,

  podcast: Podcast,
  audio: Podcast,

  // ===== CREATIVE & HOBBIES =====
  art: Palette,
  painting: Palette,
  drawing: Palette,
  creative: Palette,

  craft: Scissors,
  diy: Hammer,
  build: Wrench,
  maker: Wrench,

  photo: Camera,
  photography: Camera,
  camera: Camera,

  music: Music,
  song: Music,
  playlist: Music,
  spotify: Music,

  guitar: Guitar,
  piano: Guitar,
  instrument: Guitar,
  practice: Guitar,

  singing: Mic,
  karaoke: Mic,
  voice: Mic,

  listening: Headphones,

  film: Film,
  movie: Clapperboard,
  cinema: Clapperboard,

  // ===== PETS & ANIMALS =====
  pet: Dog,
  dog: Dog,
  puppy: Dog,

  cat: Cat,
  kitten: Cat,

  rabbit: Rabbit,
  bunny: Rabbit,

  fish: Fish,
  aquarium: Fish,

  bird: Bird,

  // ===== NATURE & OUTDOORS =====
  garden: Leaf,
  plant: Leaf,
  plants: Leaf,
  gardening: Leaf,
  green: Leaf,
  eco: Leaf,
  sustainable: Leaf,

  tree: TreeDeciduous,
  forest: TreeDeciduous,

  flower: Flower2,
  floral: Flower2,

  // ===== SPIRITUALITY & MINDFULNESS =====
  spiritual: Star,
  spirit: Star,
  soul: Star,

  church: Church,
  faith: Church,
  religion: Church,
  pray: Church,
  worship: Church,

  gratitude: Sparkles,
  grateful: Sparkles,
  thankful: Sparkles,
  affirmation: Sparkles,
  manifest: Sparkles,

  energy: Zap,
  motivation: Zap,
  inspire: Zap,

  passion: Flame,

  // ===== SEASONS & WEATHER =====
  winter: Snowflake,
  christmas: Snowflake,
  holiday: Snowflake,

  rain: CloudRain,
  weather: CloudRain,

  // ===== GOALS & ACHIEVEMENTS =====
  goal: Target,
  target: Target,
  objective: Target,
  aim: Target,

  resolution: CalendarCheck,
  newyear: CalendarCheck,

  habit: Calendar,
  daily: Calendar,
  weekly: Calendar,
  monthly: Calendar,
  routine: Calendar,
  schedule: Calendar,

  challenge: Trophy,
  competition: Trophy,
  win: Trophy,

  achievement: Award,
  accomplish: Award,
  success: Award,

  milestone: Medal,
  progress: Medal,

  productivity: Timer,
  pomodoro: Timer,
  timeblock: Timer,
  efficient: Timer,

  idea: Lightbulb,
  brainstorm: Lightbulb,
  innovation: Lightbulb,

  // ===== EVENTS & CELEBRATIONS =====
  party: PartyPopper,
  celebration: PartyPopper,
  event: PartyPopper,

  birthday: Cake,

  gift: Gift,
  present: Gift,
  surprise: Gift,

  // ===== STYLE & APPEARANCE =====
  fashion: Shirt,
  clothes: Shirt,
  wardrobe: Shirt,
  outfit: Shirt,
  style: Shirt,

  grooming: Scissors,
  haircut: Scissors,
  beauty: Sparkles,
  skincare: Sparkles,

  // ===== SECURITY & ORGANIZATION =====
  password: Lock,
  security: Shield,
  privacy: Shield,
  protection: Shield,

  organize: Folder,
  declutter: Folder,
  clean: Folder,
  tidy: Folder,
  minimalism: Folder,

  // ===== LOCATION =====
  local: MapPin,
  neighborhood: MapPin,
  city: MapPin,
  explore: Compass,
};

export function getSpaceIcon(spaceName: string): IconComponent {
  const lowerName = spaceName.toLowerCase();

  // Check each keyword
  for (const [keyword, icon] of Object.entries(ICON_KEYWORDS)) {
    if (lowerName.includes(keyword)) {
      return icon;
    }
  }

  return Folder; // Default fallback
}

// Optional: Get icon name for debugging
export function getSpaceIconName(spaceName: string): string {
  const lowerName = spaceName.toLowerCase();

  for (const keyword of Object.keys(ICON_KEYWORDS)) {
    if (lowerName.includes(keyword)) {
      return keyword;
    }
  }

  return 'folder';
}
