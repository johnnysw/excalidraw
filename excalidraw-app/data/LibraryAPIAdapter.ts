/**
 * Library API Adapter
 * 通过后端 API 进行素材库的读取和保存
 * 后端根据服务类型自动区分 ownerType（admin-backend=teacher, client-backend=member）
 */
import type { LibraryPersistedData } from "@excalidraw/excalidraw/data/library";
import type { MaybePromise } from "@excalidraw/common/utility-types";

// API 基础路径，从环境变量获取
const API_BASE_URL = import.meta.env.VITE_APP_HTTP_BACKEND || "";

/**
 * 获取当前用户的认证 token
 */
const getAuthToken = (): string | null => {
  // 从 localStorage 获取 token（与现有认证机制保持一致）
  return localStorage.getItem("token");
};

/**
 * 封装 API 请求
 */
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // 假设后端返回格式为 { code: 0, data: ..., message: ... }
  if (result.code !== 0 && result.code !== 200) {
    throw new Error(result.message || "API request failed");
  }

  return result.data;
};

/**
 * Library API Adapter
 * 实现 LibraryPersistenceAdapter 接口
 */
export class LibraryAPIAdapter {
  /**
   * 从后端加载素材库数据
   */
  static async load(): Promise<LibraryPersistedData | null> {
    try {
      const token = getAuthToken();
      // 如果没有 token，说明用户未登录，返回 null
      if (!token) {
        console.warn("[LibraryAPIAdapter] No auth token, skipping API load");
        return null;
      }

      const data = await apiRequest<LibraryPersistedData | null>(
        "/api/excalidraw/library",
        { method: "GET" }
      );

      return data;
    } catch (error) {
      console.error("[LibraryAPIAdapter] Failed to load library:", error);
      return null;
    }
  }

  /**
   * 保存素材库数据到后端
   */
  static save(data: LibraryPersistedData): MaybePromise<void> {
    const token = getAuthToken();
    // 如果没有 token，说明用户未登录，跳过保存
    if (!token) {
      console.warn("[LibraryAPIAdapter] No auth token, skipping API save");
      return;
    }

    return apiRequest<void>("/api/excalidraw/library", {
      method: "POST",
      body: JSON.stringify(data),
    }).catch((error) => {
      console.error("[LibraryAPIAdapter] Failed to save library:", error);
      throw error;
    });
  }
}
