export type BaseType = 'log' | 'todo' | 'habit';

export type LogState = { body: string; title: string };
export type TodoState = { title: string; details: string; due_at?: string | null };
export type HabitState = { title: string; notes: string; schedule?: 'daily' | 'weekly' | 'custom' };

export type V2State = {
  baseType: BaseType;
  log: LogState;
  todo: TodoState;
  habit: HabitState;
  // future: tags, mentions, etc. (Phase 3), keep here to be non-destructive
};

export const initialV2State: V2State = {
  baseType: 'log',
  log: { title: '', body: '' },
  todo: { title: '', details: '', due_at: null },
  habit: { title: '', notes: '', schedule: 'custom' },
};

type Action =
  | { type: 'SET_BASE_TYPE'; to: BaseType }
  | { type: 'SET_TEXT'; text: string } // applies to current type
  | { type: 'HYDRATE_EDIT'; payload: Partial<V2State> }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_TODO_DUE'; due_at: string | null };

export function v2Reducer(state: V2State, action: Action): V2State {
  switch (action.type) {
    case 'SET_BASE_TYPE':
      return { ...state, baseType: action.to };
    case 'SET_TEXT': {
      if (state.baseType === 'log')
        return {
          ...state,
          log: { ...state.log, body: action.text, title: firstLine(action.text) },
        };
      if (state.baseType === 'todo')
        return {
          ...state,
          todo: { ...state.todo, details: action.text, title: firstLine(action.text) },
        };
      return {
        ...state,
        habit: { ...state.habit, notes: action.text, title: firstLine(action.text) },
      };
    }
    case 'SET_TITLE': {
      if (state.baseType === 'log') return { ...state, log: { ...state.log, title: action.title } };
      if (state.baseType === 'todo')
        return { ...state, todo: { ...state.todo, title: action.title } };
      return { ...state, habit: { ...state.habit, title: action.title } };
    }
    case 'SET_TODO_DUE':
      return { ...state, todo: { ...state.todo, due_at: action.due_at } };
    case 'HYDRATE_EDIT':
      return { ...state, ...action.payload } as V2State;
    default:
      return state;
  }
}

export function firstLine(t: string) {
  return (t ?? '').split(/\r?\n/)[0]?.trim().slice(0, 120) ?? '';
}
