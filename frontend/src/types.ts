/**
 * Core type definitions for Talus Tally
 */

export interface Position {
  x: number;
  y: number;
}

export interface GraphPort {
  name: string;
  type?: string;
  description?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  position: Position;
  properties?: Record<string, unknown>;
  inputs?: GraphPort[];
  outputs?: GraphPort[];
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
  metadata?: Record<string, unknown>;
}

export interface Graph {
  id: string;
  name?: string;
  description?: string;
  nodes?: Record<string, GraphNode>;
  edges?: GraphEdge[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferences?: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  graphs: Graph[];
  createdAt: string;
  updatedAt: string;
}

export interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  searchOpen: boolean;
}

export interface FormFieldError {
  field: string;
  message: string;
}

export interface FormState<T> {
  values: T;
  errors: Record<keyof T, string>;
  touched: Record<keyof T, boolean>;
  isSubmitting: boolean;
  isDirty: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp?: number;
}
