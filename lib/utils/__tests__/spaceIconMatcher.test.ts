import { getSpaceIcon, getSpaceIconName } from '../spaceIconMatcher';
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
  Folder,
  Brain,
  Coffee,
  Scale,
  Mountain,
  Code,
  Music,
  Dog,
  Cat,
  Target,
  Calendar,
  Trophy,
} from 'lucide-react-native';

describe('spaceIconMatcher', () => {
  describe('getSpaceIcon', () => {
    it('returns Folder for empty string', () => {
      expect(getSpaceIcon('')).toBe(Folder);
    });

    it('returns Folder for unmatched names', () => {
      expect(getSpaceIcon('Random Space')).toBe(Folder);
      expect(getSpaceIcon('xyz123')).toBe(Folder);
    });

    // Health & Wellness
    it('matches alcohol/drinking keywords to Wine', () => {
      expect(getSpaceIcon('Quit Drinking')).toBe(Wine);
      expect(getSpaceIcon('Sober Journey')).toBe(Wine);
      expect(getSpaceIcon('No Alcohol')).toBe(Wine);
    });

    it('matches fitness keywords to Dumbbell', () => {
      expect(getSpaceIcon('Gym Goals')).toBe(Dumbbell);
      expect(getSpaceIcon('Workout Plan')).toBe(Dumbbell);
      expect(getSpaceIcon('Fitness Journey')).toBe(Dumbbell);
    });

    it('matches mental health keywords to Brain', () => {
      expect(getSpaceIcon('Mental Health')).toBe(Brain);
      expect(getSpaceIcon('Meditation Practice')).toBe(Brain);
      expect(getSpaceIcon('Therapy Notes')).toBe(Brain);
    });

    it('matches weight/diet keywords to Scale', () => {
      expect(getSpaceIcon('Weight Loss')).toBe(Scale);
      expect(getSpaceIcon('Keto Diet')).toBe(Scale);
      expect(getSpaceIcon('Counting Calories')).toBe(Scale);
    });

    // Travel
    it('matches travel keywords to Plane', () => {
      expect(getSpaceIcon('Honeymoon Planning')).toBe(Plane);
      expect(getSpaceIcon('Vacation 2024')).toBe(Plane);
      expect(getSpaceIcon('Trip to Japan')).toBe(Plane);
    });

    it('matches hiking/mountain keywords to Mountain', () => {
      expect(getSpaceIcon('Hiking Adventures')).toBe(Mountain);
      expect(getSpaceIcon('Mountain Climbing')).toBe(Mountain);
    });

    // Work & Career
    it('matches work keywords to Briefcase', () => {
      expect(getSpaceIcon('Work Projects')).toBe(Briefcase);
      expect(getSpaceIcon('Job Search')).toBe(Briefcase);
      expect(getSpaceIcon('My Job Goals')).toBe(Briefcase);
    });

    // Finance
    it('matches money keywords to DollarSign', () => {
      expect(getSpaceIcon('Money Management')).toBe(DollarSign);
      expect(getSpaceIcon('Income Tracking')).toBe(DollarSign);
    });

    // Relationships
    it('matches relationship keywords to Heart', () => {
      expect(getSpaceIcon('Wedding Planning')).toBe(Heart);
      expect(getSpaceIcon('Relationship Goals')).toBe(Heart);
      expect(getSpaceIcon('Dating Life')).toBe(Heart);
    });

    it('matches baby keywords to Baby', () => {
      expect(getSpaceIcon('Baby Prep')).toBe(Baby);
      expect(getSpaceIcon('Pregnancy Journey')).toBe(Baby);
    });

    it('matches home/family keywords to Home', () => {
      expect(getSpaceIcon('Family Time')).toBe(Home);
      expect(getSpaceIcon('House Hunt')).toBe(Home);
      expect(getSpaceIcon('Moving Plans')).toBe(Home);
    });

    // Education
    it('matches learning keywords to GraduationCap', () => {
      expect(getSpaceIcon('Learning Spanish')).toBe(GraduationCap);
      expect(getSpaceIcon('Study Notes')).toBe(GraduationCap);
      expect(getSpaceIcon('Course Progress')).toBe(GraduationCap);
    });

    // Technology
    it('matches coding keywords to Code', () => {
      expect(getSpaceIcon('Coding Projects')).toBe(Code);
      expect(getSpaceIcon('Programming Basics')).toBe(Code);
      expect(getSpaceIcon('App Development')).toBe(Code);
    });

    // Hobbies
    it('matches music keywords to Music', () => {
      expect(getSpaceIcon('Music Practice')).toBe(Music);
      expect(getSpaceIcon('Song Ideas')).toBe(Music);
    });

    it('matches coffee keywords to Coffee', () => {
      expect(getSpaceIcon('Coffee Journey')).toBe(Coffee);
      expect(getSpaceIcon('Caffeine Tracking')).toBe(Coffee);
    });

    // Pets
    it('matches pet keywords to Dog/Cat', () => {
      expect(getSpaceIcon('My Dog')).toBe(Dog);
      expect(getSpaceIcon('My Cat')).toBe(Cat);
      expect(getSpaceIcon('Pet Health')).toBe(Dog);
    });

    // Goals
    it('matches goal keywords to Target', () => {
      expect(getSpaceIcon('Goal Setting')).toBe(Target);
      expect(getSpaceIcon('2024 Targets')).toBe(Target);
    });

    it('matches habit keywords to Calendar', () => {
      expect(getSpaceIcon('Habit Tracker')).toBe(Calendar);
      expect(getSpaceIcon('Daily Routine')).toBe(Calendar);
    });

    it('matches challenge keywords to Trophy', () => {
      expect(getSpaceIcon('30 Day Challenge')).toBe(Trophy);
      expect(getSpaceIcon('Win the Trophy')).toBe(Trophy);
    });

    // Case insensitivity
    it('is case insensitive', () => {
      expect(getSpaceIcon('GYM GOALS')).toBe(Dumbbell);
      expect(getSpaceIcon('gym goals')).toBe(Dumbbell);
      expect(getSpaceIcon('Gym Goals')).toBe(Dumbbell);
    });

    // First match wins
    it('returns first matching icon when multiple keywords match', () => {
      // "work" appears before "goal" in the keywords list
      const icon = getSpaceIcon('Work Goal Planning');
      // This will match "work" first
      expect(icon).toBe(Briefcase);
    });
  });

  describe('getSpaceIconName', () => {
    it('returns "folder" for unmatched names', () => {
      expect(getSpaceIconName('')).toBe('folder');
      expect(getSpaceIconName('Random Space')).toBe('folder');
    });

    it('returns the matched keyword', () => {
      expect(getSpaceIconName('Gym Goals')).toBe('gym');
      expect(getSpaceIconName('Wedding Planning')).toBe('wedding');
      expect(getSpaceIconName('Coding Projects')).toBe('coding');
    });
  });
});
