import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
import { createAdminRoutes } from "./routes/admin.ts";
import { createLibraryRoutes } from "./routes/library.ts";
import { createPlantRoutes } from "./routes/plants.ts";
import { createMoodJournalRoutes } from "./routes/moods-journals.ts";
import { createMomentRoutes } from "./routes/moments.ts";
import { createInviteRoutes } from "./routes/invites.ts";
import { createNotificationRoutes } from "./routes/notifications.ts";
import { createStatsRoutes } from "./routes/stats.ts";
import { createUploadRoutes } from "./routes/upload.ts";
import { createTimelineRoutes } from "./routes/timeline.ts";

const app = new Hono();

// Global Error Handler - Ensure standard JSON response
app.onError((err, c) => {
  console.error("Hono Error:", err);
  return c.json({ 
    error: "Internal Server Error", 
    message: err.message,
    success: false
  }, 500);
});

// Configure CORS for all routes (including 404s and errors)
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-client-info",
      "apikey",
      "X-User-JWT",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Enable logger
app.use("*", logger(console.log));

const bucketName = "make-4b732228-snapshots";
const defaultSupabaseUrl = "https://dkszigraljeptpeiimzg.supabase.co";
const defaultAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrc3ppZ3JhbGplcHRwZWlpbXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MjkyMDEsImV4cCI6MjA4ODAwNTIwMX0.piPkMGZDQ6O4l-YhZwPIU-Fp5Q-UUwt5fwvYlKVu6x0";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || defaultSupabaseUrl;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || defaultAnonKey;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || defaultAnonKey;
const devAdminBypassToken = Deno.env.get("DEV_ADMIN_BYPASS_TOKEN")?.trim();
const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
);

// Helper to get user from token
async function getUser(c: any) {
  try {
    let token = c.req.header("X-User-JWT");

    if (!token) {
      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        const parts = authHeader.split(" ");
        if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
          token = parts[1];
        } else {
          token = authHeader;
        }
      }
    }

    if (!token) {
      console.log("No token provided");
      return null;
    }

    if (devAdminBypassToken && token.trim() === devAdminBypassToken) {
      return {
        id: "dev-admin",
        email: "776427024@qq.com",
        user_metadata: { role: "admin", name: "Local Dev Admin" },
      };
    }

    const anonKey = supabaseAnonKey;
    const serviceKey = supabaseServiceRoleKey;
    
    // Clean token comparison
    const cleanToken = token.trim();
    
    // Check if it's the anon key or service key first
    if (cleanToken === anonKey || cleanToken === serviceKey) {
      return null;
    }

    // Robust JWT check
    const parts = cleanToken.split('.');
    if (!cleanToken || cleanToken.length < 50 || parts.length !== 3) {
      console.log("Skipping auth: token is invalid JWT format or not a user token");
      return null;
    }

    // Deep check: Decipher payload to check for 'sub' (subject) claim
    // This prevents the "missing sub claim" error from Supabase Auth
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload || !payload.sub) {
        console.log("Skipping auth: JWT is valid but missing 'sub' claim (likely anon/service key)");
        return null;
      }
    } catch (e) {
      console.log("Skipping auth: Could not parse JWT payload");
      return null;
    }

    console.log("Attempting to verify user token...");
    const { data: { user }, error } = await supabase.auth.getUser(cleanToken);
    if (error) {
      console.error("Auth error:", error.message);
      return null;
    }
    if (!user) {
      console.log("No user found for token");
      return null;
    }
    console.log("User authenticated:", user.email);
    return user;
  } catch (err) {
    console.error("getUser error:", err);
    return null;
  }
}

const ACHIEVEMENTS = [
  { id: 'a1', category: 'growth', name: '初露锋芒', desc: '成功认领第一棵植物', icon: '🌱', requirement: { type: 'plants', count: 1 }, reward: 50 },
  { id: 'a2', category: 'growth', name: '园艺达人', desc: '拥有 3 棵及以上植物', icon: '🌿', requirement: { type: 'plants', count: 3 }, reward: 150 },
  { id: 'a3', category: 'care', name: '细心守护', desc: '累计进行 5 次浇水', icon: '💧', requirement: { type: 'water', count: 5 }, reward: 100 },
  { id: 'a4', category: 'growth', name: '持之以恒', desc: '累计发布 5 篇成长手记', icon: '📓', requirement: { type: 'posts', count: 5 }, reward: 200 },
  { id: 'a5', category: 'social', name: '社交新星', desc: '获得 10 个点赞', icon: '✨', requirement: { type: 'likes', count: 10 }, reward: 150 },
  { id: 'a6', category: 'level', name: '步入正轨', desc: '等级达到 Lv.5', icon: '⭐', requirement: { type: 'level', count: 5 }, reward: 300 },
  { id: 'a7', category: 'social', name: '意见领袖', desc: '获得 50 个点赞', icon: '👑', requirement: { type: 'likes', count: 50 }, reward: 500 },
  { id: 'a8', category: 'care', name: '生命之源', desc: '累计进行 20 次浇水', icon: '🌊', requirement: { type: 'water', count: 20 }, reward: 400 },
];

async function updateUserStats(userId: string, type: 'posts' | 'likes' | 'comments' | 'water' | 'fertilizer' | 'plants' | 'streak' | 'exp' | 'sync', increment = 1, forceValues?: any) {
  try {
    const statsKey = `stats:${userId}`;
    let stats = (await kv.get(statsKey)) || { 
      userId, 
      level: 1, 
      exp: 0, 
      totalPosts: 0, 
      totalLikes: 0, 
      totalComments: 0, 
      waterCount: 0, 
      fertilizerCount: 0, 
      plantsAdopted: 0, 
      loginStreak: 0, 
      achievements: [] 
    };

    // If forceValues are provided, use them
    if (forceValues) {
      stats = { ...stats, ...forceValues };
    }
    
    // Ensure all fields exist
    stats.totalPosts = stats.totalPosts || 0;
    stats.totalLikes = stats.totalLikes || 0;
    stats.totalComments = stats.totalComments || 0;
    stats.waterCount = stats.waterCount || 0;
    stats.fertilizerCount = stats.fertilizerCount || 0;
    stats.plantsAdopted = stats.plantsAdopted || 0;
    stats.loginStreak = stats.loginStreak || 0;
    stats.exp = stats.exp || 0;
    stats.level = stats.level || 1;
    stats.achievements = stats.achievements || [];

    if (type === 'exp') {
      stats.exp += increment;
    } else if (type === 'sync') {
      // Just re-run the achievement checks with current values
    } else {
      const fieldMap: any = {
        posts: 'totalPosts',
        likes: 'totalLikes',
        comments: 'totalComments',
        water: 'waterCount',
        fertilizer: 'fertilizerCount',
        plants: 'plantsAdopted',
        streak: 'loginStreak'
      };
      const field = fieldMap[type];
      if (field) {
        stats[field] = (stats[field] || 0) + increment;
      }
      // Add exp for every action
      stats.exp += (type === 'posts' ? 20 : type === 'plants' ? 50 : 5);
    }

    // Level up logic
    let expForNext = Math.max(10, (stats.level * stats.level * 10));
    while (stats.exp >= expForNext) {
      stats.level += 1;
      expForNext = Math.max(10, (stats.level * stats.level * 10));
    }

    // Achievement unlock logic
    for (const achievement of ACHIEVEMENTS) {
      if (stats.achievements.includes(achievement.id)) continue;

      const { type: reqType, count: reqCount } = achievement.requirement;
      let currentValue = 0;
      switch (reqType) {
        case 'posts': currentValue = stats.totalPosts; break;
        case 'likes': currentValue = stats.totalLikes; break;
        case 'comments': currentValue = stats.totalComments; break;
        case 'water': currentValue = stats.waterCount; break;
        case 'fertilizer': currentValue = stats.fertilizerCount; break;
        case 'plants': currentValue = stats.plantsAdopted; break;
        case 'streak': currentValue = stats.loginStreak; break;
        case 'level': currentValue = stats.level; break;
      }

      if (currentValue >= reqCount) {
        stats.achievements.push(achievement.id);
        stats.exp += achievement.reward;
        // Re-check level up after achievement reward
        while (stats.exp >= Math.max(10, (stats.level * stats.level * 10))) {
          stats.level += 1;
        }
      }
    }

    await kv.set(statsKey, stats);
    return stats;
  } catch (err) {
    console.error("updateUserStats error:", err);
    return null;
  }
}

// Routes registration
const registerRoutes = (r: Hono) => {
  r.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  r.post("/signup", async (c) => {
    try {
      const { email, password, name } = await c.req.json();
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: { name, role: email.toLowerCase() === '776427024@qq.com' ? 'admin' : 'user' },
        email_confirm: true
      });

      if (error) {
        const isDuplicate = error.message.includes("already been registered");
        if (isDuplicate) {
          console.log(`Signup attempt for existing user: ${email}`);
          return c.json({ 
            error: "该邮箱已被注册，请直接登录", 
            code: "USER_ALREADY_EXISTS",
            success: false 
          }, 400);
        }
        console.error("Signup error:", error.message);
        return c.json({ error: error.message, success: false }, 400);
      }

      return c.json({ success: true, user: data.user });
    } catch (err: any) {
      return c.json({ error: "Failed to create user", details: err.message }, 500);
    }
  });

  r.get("/profile", async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email?.split("@")[0],
      avatar: ((user.user_metadata as Record<string, any> | undefined)?.avatar as string | undefined) || "",
      role: user.user_metadata?.role || (user.email?.toLowerCase() === '776427024@qq.com' ? 'admin' : 'user')
    });
  });

  r.route("/", createLibraryRoutes({ kv }));
  r.route("/", createPlantRoutes({ getUser, updateUserStats, kv }));
  r.route("/", createMoodJournalRoutes({ getUser, updateUserStats, kv }));
  r.route("/", createMomentRoutes({ getUser, updateUserStats, kv }));
  r.route("/", createInviteRoutes({ getUser, updateUserStats, kv }));
  r.route("/", createNotificationRoutes({ kv }));
  r.route("/", createStatsRoutes({ getUser, updateUserStats, kv }));
  r.route("/", createUploadRoutes({ supabase, bucketName }));
  r.route("/", createTimelineRoutes({ kv }));

  // Batch seeding to prevent 502 gateway errors and rate limiting
  r.post("/seed-batch", async (c) => {
    try {
      const { items } = await c.req.json();
      if (!Array.isArray(items)) throw new Error("Items must be an array");
      const user = await getUser(c);
      
      const updates: Record<string, any> = {};
      
      for (const item of items) {
        const { type, data } = item;
        let key = "";
        if (type === 'mood') {
           key = `mood:${data.plantId}:${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        } else if (type === 'journal') {
           key = `journal:${data.plantId}:${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        } else if (type === 'log-activity') {
           key = `log:${data.plantId}:${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        } else {
           key = `${type}:${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        }
        
        data.id = key;
        data.userId = user?.id || data.userId;
        data.created_at = new Date().toISOString();
        updates[key] = data;
      }

      await kv.mset(Object.keys(updates), Object.values(updates));
      
      if (user) {
        await updateUserStats(user.id, 'sync', 0);
      }

      return c.json({ success: true, count: items.length });
    } catch (err: any) {
      console.error("Batch seed error:", err);
      return c.json({ error: "Batch seed failed", details: err.message }, 500);
    }
  });

  r.post("/log-activity", async (c) => {
    try {
      const user = await getUser(c);
      const { plantId, type, userName, details } = await c.req.json();
      const activityId = `activity:${plantId}:${Date.now()}`;
      const activity = { id: activityId, plantId, actionType: type, userName, details, timestamp: new Date().toISOString() };
      await kv.set(activityId, activity);
      
      const plant = await kv.get(plantId);
      if (plant) {
        plant.health = Math.min(100, (plant.health || 0) + (type === "watering" ? 5 : 2));
        await kv.set(plantId, plant);
      }
      
      // Update user stats for watering
      if (user && type === "watering") {
        await updateUserStats(user.id, 'water', 1);
      } else if (user && type === "fertilizing") {
        await updateUserStats(user.id, 'fertilizer', 1);
      }
      
      return c.json({ success: true, activity });
    } catch (err: any) {
      return c.json({ error: "Failed to log activity", details: err.message }, 400);
    }
  });

  r.get("/achievements", (c) => {
    return c.json(ACHIEVEMENTS);
  });

  r.get("/debug-db", async (c) => {
    const plants = await kv.getByPrefix("plant:");
    const library = await kv.getByPrefix("library:");
    const invites = await kv.getByPrefix("invite:");
    return c.json({ 
      plants: plants?.length || 0, 
      library: library?.length || 0,
      invites: invites?.length || 0
    });
  });

};

// Create a sub-router for all API endpoints
const api = new Hono();
registerRoutes(api);
const adminRoutes = createAdminRoutes({ getUser, kv });
api.route("/admin", adminRoutes);

// Register routes explicitly on the main app to avoid mounting issues in some environments
registerRoutes(app as unknown as Hono); // Register at root
app.route("/admin", adminRoutes);
const prefix = "/make-server-4b732228";

// Mount the sub-router as a fallback
app.route(prefix, api);
app.route("/", api);

// Catch-all 404 handler to ensure JSON is returned
app.all("*", (c) => {
  return c.json({ 
    error: "Not Found", 
    message: `Path ${c.req.path} not found on this server`,
    success: false 
  }, 404);
});

// Startup tasks (idempotent)
const initBucket = async () => {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket) => bucket.name === bucketName);
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 20971520, // 20MB to be safe for high-res screenshots
      });
    }
  } catch (error) {
    console.error("Error initializing bucket:", error);
  }
};

const initializeMockPlants = async () => {
  try {
    // 1. Fetch all existing library items in one go
    const lib = await kv.getByPrefix("library:") || [];
    
    // We want to ensure these 8 base plants always exist with high quality images
    const mockPlants = [
      { 
        id: "p1", 
        name: "银皇后", 
        type: "观叶植物", 
        difficulty: "easy",
        scene: "family",
        description: "具有极强的空气净化能力，象征着高贵与纯洁。", 
        imageUrl: "https://images.unsplash.com/photo-1677833524795-a815afaff22f?q=80&w=1080", 
        tags: ["净化空气", "耐阴"], 
        addedDate: "2024-01-15",
        habits: "喜半阴环境，忌烈日直射。最适生长温度为20-30℃。",
        lifespan: "10-15年",
        emotionalMeaning: "纯洁无瑕的守护，愿时光温柔以待。",
        dimensions: { healing: 85, companion: 70, vitality: 60 }
      },
      { 
        id: "p2", 
        name: "珍珠吊兰", 
        type: "多肉植物", 
        difficulty: "medium",
        scene: "love",
        description: "如同一串串绿色的珍珠，饱满而富有生命力。", 
        imageUrl: "https://images.unsplash.com/photo-1648070024741-43f8fa965966?q=80&w=1080", 
        tags: ["垂吊", "多肉"], 
        addedDate: "2024-01-20",
        habits: "喜凉爽、干燥和阳光充足的环境。最怕高温潮湿。",
        lifespan: "5-8年",
        emotionalMeaning: "每一颗珍珠都是我对你的思念，连绵不绝。",
        dimensions: { healing: 70, companion: 90, vitality: 50 }
      },
      { 
        id: "p3", 
        name: "龟背竹", 
        type: "观叶植物", 
        difficulty: "easy",
        scene: "solo",
        description: "巨大的叶片如同龟背，极具热带风情，是非常受欢迎的室内植物。", 
        imageUrl: "https://images.unsplash.com/photo-1713755008116-773bfc0a6431?q=80&w=1080", 
        tags: ["北欧风", "耐阴"], 
        addedDate: "2024-01-25",
        habits: "喜温暖湿润环境，忌强光直射。耐阴性极强。",
        lifespan: "20-30年",
        emotionalMeaning: "在静谧的空间里，与时光共成长。",
        dimensions: { healing: 60, companion: 65, vitality: 90 }
      },
      { 
        id: "p4", 
        name: "琴叶榕", 
        type: "观叶植物", 
        difficulty: "hard",
        scene: "friend",
        description: "挺拔的身姿配上提琴状的叶片，是家中的视觉中心。", 
        imageUrl: "https://images.unsplash.com/photo-1596547612397-1432a7a7d37d?q=80&w=1080", 
        tags: ["网红植物", "大中型"], 
        addedDate: "2024-02-01",
        habits: "对光照要求较高，喜温暖湿润，通风良好的环境。",
        lifespan: "15-20年",
        emotionalMeaning: "如同挚友，挺拔而坚定地陪伴在你身边。",
        dimensions: { healing: 50, companion: 85, vitality: 80 }
      },
      { 
        id: "p5", 
        name: "虎皮兰", 
        type: "观叶植物", 
        difficulty: "easy",
        scene: "family",
        description: "叶片坚挺直立，姿态刚毅，是非常容易养护的室内植物。", 
        imageUrl: "https://images.unsplash.com/photo-1593482892290-f54927ae1bb6?q=80&w=1080", 
        tags: ["强力净化", "懒人植物"], 
        addedDate: "2024-03-01",
        habits: "耐干旱，耐半阴，忌水涝。适应性极强。",
        lifespan: "10-20年",
        emotionalMeaning: "坚韧不拔的爱，是你最稳固的依靠。",
        dimensions: { healing: 75, companion: 50, vitality: 95 }
      },
      { 
        id: "p6", 
        name: "绿萝", 
        type: "观叶植物", 
        difficulty: "easy",
        scene: "friend",
        description: "生命力极其顽强，叶片四季常绿，是新房除甲醛的首选。", 
        imageUrl: "https://images.unsplash.com/photo-1674482918961-57a3a0484bf3?q=80&w=1080", 
        tags: ["新手推荐", "水培土培"], 
        addedDate: "2024-03-02",
        habits: "喜温暖湿润环境，极耐阴。生根能力极强。",
        lifespan: "5-10年",
        emotionalMeaning: "即使在最角落，也要为你带来一抹绿意。",
        dimensions: { healing: 90, companion: 75, vitality: 85 }
      },
      { 
        id: "p7", 
        name: "薰衣草", 
        type: "芳香植物", 
        difficulty: "medium",
        scene: "love",
        description: "带有清淡宜人的香气，能舒缓压力，助眠安神。", 
        imageUrl: "https://images.unsplash.com/photo-1658545056023-ce30117cd9ad?q=80&w=1080", 
        tags: ["助眠", "紫色浪漫"], 
        addedDate: "2024-03-03",
        habits: "喜阳光充足，通风良好的环境。忌积水。",
        lifespan: "3-5年",
        emotionalMeaning: "等待爱情，芬芳了你的每一个梦境。",
        dimensions: { healing: 95, companion: 60, vitality: 55 }
      },
      { 
        id: "p8", 
        name: "静夜多肉", 
        type: "多肉植物", 
        difficulty: "medium",
        scene: "solo",
        description: "叶片圆润，尖端微红，如同月色下的静谧之夜。", 
        imageUrl: "https://images.unsplash.com/photo-1761371290431-d5b23356eaa7?q=80&w=1080", 
        tags: ["精致", "多肉"], 
        addedDate: "2024-03-04",
        habits: "喜阳光，忌高温。生长期需要充足日照。",
        lifespan: "5-10年",
        emotionalMeaning: "独处的时光，也是绽放美丽的时刻。",
        dimensions: { healing: 80, companion: 40, vitality: 70 }
      }
    ];

    // Collect all items to set at once using mset
    const updates: Record<string, any> = {};
    let hasUpdates = false;

    for (const p of mockPlants) {
      const existing = lib.find((item: any) => item.id === p.id);
      
      // If it doesn't exist or is one of the mock ones, ensure it has the new data
      if (!existing || p.id.startsWith('p')) {
        updates[`library:${p.id}`] = p;
        hasUpdates = true;
      }
    }

    // 2. Perform a single batch operation if updates are needed
    if (hasUpdates) {
      console.log("Mock init: updating library with mset...");
      await kv.mset(Object.keys(updates), Object.values(updates));
    }
  } catch (err) {
    console.error("Mock init error:", err);
  }
};

// Start background tasks without awaiting to speed up cold starts
initBucket();
initializeMockPlants();

// Start Deno server
Deno.serve(app.fetch);