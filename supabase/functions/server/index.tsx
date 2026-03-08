import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import { Buffer } from "node:buffer";
import * as kv from "./kv_store.tsx";
import { createAdminRoutes } from "./routes/admin.ts";
import { createLibraryRoutes } from "./routes/library.ts";
import { createPlantRoutes } from "./routes/plants.ts";
import { createMoodJournalRoutes } from "./routes/moods-journals.ts";
import { createMomentRoutes } from "./routes/moments.ts";

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

  r.post("/generate-invite", async (c) => {
    try {
      const { plantId, inviterId, inviterName } = await c.req.json();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const data = { code, plantId, inviterId, inviterName, timestamp: new Date().toISOString() };
      await kv.set(`invite:${code}`, data);
      return c.json({ success: true, code });
    } catch (err: any) {
      return c.json({ error: "Failed to generate invite", details: err.message }, 400);
    }
  });

  r.post("/accept-invite", async (c) => {
    try {
      const user = await getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const { inviteCode, userName } = await c.req.json();
      const data = await kv.get(`invite:${inviteCode?.toUpperCase()}`);
      if (!data) return c.json({ error: "Invalid invite code" }, 404);
      const plant = await kv.get(data.plantId);
      if (!plant) return c.json({ error: "Plant not found" }, 404);
      
      if (!plant.ownerEmails) plant.ownerEmails = [];
      if (!plant.owners) plant.owners = [];
      
      if (!plant.ownerEmails.includes(user.email)) {
        if (!plant.owners) plant.owners = [];
        if (!plant.ownerEmails) plant.ownerEmails = [];
        if (!plant.ownerIds) plant.ownerIds = [];
        
        const userEmail = user.email || "";
        plant.owners.push(userName || user.user_metadata?.name || userEmail.split("@")[0] || "用户");
        plant.ownerEmails.push(userEmail);
        plant.ownerIds.push(user.id);
        
        await kv.set(data.plantId, plant);
        
        // Update stats for the user who accepted
        await updateUserStats(user.id, 'plants', 1);
      }
      
      // 3. Delete the notification
      const userEmail = (user.email || "").toLowerCase();
      await kv.del(`notification:${userEmail}:${inviteCode?.toUpperCase()}`);
      
      return c.json({ success: true, plant });
    } catch (err: any) {
      return c.json({ error: "Failed to accept invite", details: err.message }, 400);
    }
  });

  r.get("/camera-snapshot/:id", async (c) => {
    return c.json({ error: "Camera snapshot not available", message: "Use WebRTC stream instead" }, 503);
  });

  r.post("/follow", async (c) => {
    try {
      const user = await getUser(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const { targetUserId } = await c.req.json();
      const key = `follow:${user.id}:${targetUserId}`;
      await kv.set(key, { followerId: user.id, targetUserId, timestamp: new Date().toISOString() });
      return c.json({ success: true });
    } catch (err: any) {
      return c.json({ error: "Failed to follow", details: err.message }, 400);
    }
  });

  r.post("/send-direct-invite", async (c) => {
    try {
      const { plantId, inviterId, inviterName, targetEmail } = await c.req.json();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const timestamp = new Date().toISOString();
      
      // 1. Create the invite
      const inviteData = { code, plantId, inviterId, inviterName, timestamp };
      await kv.set(`invite:${code}`, inviteData);
      
      // 2. Create the notification for the target user
      const notificationId = `notification:${targetEmail.toLowerCase()}:${code}`;
      const notificationData = {
        id: notificationId,
        from: inviterName,
        inviteCode: code,
        timestamp: timestamp
      };
      await kv.set(notificationId, notificationData);
      
      return c.json({ success: true, code });
    } catch (err: any) {
      return c.json({ error: "Failed to send direct invite", details: err.message }, 400);
    }
  });

  r.get("/notifications/:email", async (c) => {
    try {
      const email = c.req.param("email").toLowerCase();
      const notifications = await kv.getByPrefix(`notification:${email}:`);
      return c.json(notifications || []);
    } catch (err: any) {
      return c.json({ error: "Failed to fetch notifications", details: err.message }, 500);
    }
  });

  r.get("/following", async (c) => {
    const user = await getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const follows = await kv.getByPrefix(`follow:${user.id}:`);
    return c.json(follows || []);
  });

  r.get("/stats/:userId", async (c) => {
    const userId = c.req.param("userId");
    const user = await getUser(c); // Try to get user to verify if they are looking at their own stats
    
    let stats = await kv.get(`stats:${userId}`);
    const defaultStats = { 
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
    
    if (!stats) stats = defaultStats;
    else stats = { ...defaultStats, ...stats };

    // SANITY CHECK: If user is looking at their own stats, we can re-verify counts
    if (user && user.id === userId) {
      try {
        let needsUpdate = false;
        const userEmail = user.email?.toLowerCase();
        console.log(`[Stats Sync] Starting sync for user: ${userId} (${userEmail})`);

        // 1. Re-verify plant count
        const allPlants = (await kv.getByPrefix("plant:")) || [];
        const userPlants = allPlants.filter((p: any) => {
          const hasId = (p.ownerIds || []).includes(userId);
          const hasEmail = userEmail && (p.ownerEmails || []).some((e: string) => e.toLowerCase() === userEmail);
          return hasId || hasEmail;
        });
        
        console.log(`[Stats Sync] Found ${userPlants.length} plants (Current in stats: ${stats.plantsAdopted})`);
        if (userPlants.length !== stats.plantsAdopted) {
          stats.plantsAdopted = userPlants.length;
          needsUpdate = true;
        }

        // 2. Re-verify post count (moments, moods, journals)
        const allMoments = (await kv.getByPrefix("moment:")) || [];
        const userMoments = allMoments.filter((m: any) => m.userId === userId);
        
        const allMoods = (await kv.getByPrefix("mood:")) || [];
        const userMoods = allMoods.filter((m: any) => m.userId === userId);

        const allJournals = (await kv.getByPrefix("journal:")) || [];
        const userJournals = allJournals.filter((j: any) => j.userId === userId);

        const actualTotalPosts = userMoments.length + userMoods.length + userJournals.length;
        console.log(`[Stats Sync] Found ${actualTotalPosts} total posts (Current in stats: ${stats.totalPosts})`);
        if (actualTotalPosts !== stats.totalPosts) {
          stats.totalPosts = actualTotalPosts;
          needsUpdate = true;
        }

        // 3. Re-verify received likes
        const actualTotalLikes = userMoments.reduce((sum: number, m: any) => sum + (m.likes || 0), 0);
        console.log(`[Stats Sync] Found ${actualTotalLikes} total likes (Current in stats: ${stats.totalLikes})`);
        if (actualTotalLikes !== stats.totalLikes) {
          stats.totalLikes = actualTotalLikes;
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          console.log(`[Stats Sync] Updating stats in KV for ${userId}`);
          // Trigger a stats update to also check achievements and level
          await updateUserStats(userId, 'sync', 0, {
            plantsAdopted: stats.plantsAdopted,
            totalPosts: stats.totalPosts,
            totalLikes: stats.totalLikes
          }); 
          stats = await kv.get(`stats:${userId}`); // Re-fetch updated stats
        }
      } catch (e) {
        console.error("[Stats Sync] Sanity check failed:", e);
      }
    }
    
    return c.json(stats);
  });

  r.post("/upload-snapshot", async (c) => {
    try {
      const { image, plantId } = await c.req.json();
      if (!image) return c.json({ error: "No image data" }, 400);
      if (!plantId) return c.json({ error: "No plantId provided" }, 400);

      console.log(`Processing snapshot upload for plant: ${plantId}`);

      // Extract base64 part safely
      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        return c.json({ error: "Invalid image format", details: "Could not parse base64 data" }, 400);
      }
      
      const fileExt = matches[1] || 'png';
      const base64Data = matches[2];
      
      // Use Buffer for safer decoding
      const bytes = Buffer.from(base64Data, 'base64');
      
      const timestamp = Date.now();
      const sanitizedPlantId = plantId.toString().replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `snapshot-${timestamp}.${fileExt}`;
      const filePath = `${sanitizedPlantId}/${fileName}`;

      console.log(`Uploading ${bytes.length} bytes to storage path: ${filePath}`);

      // Attempt upload with service role
      const { data, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, bytes, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error("Supabase Storage Upload Error Detail:", uploadError);
        
        // Use a broader check for missing bucket
        const isNotFoundError = 
          uploadError.message?.toLowerCase().includes("not found") || 
          (uploadError as any).status === 404 || 
          (uploadError as any).statusCode === "404" ||
          (uploadError as any).status === 400; // Sometimes 400 is returned for bad bucket

        if (isNotFoundError) {
          console.log(`Bucket ${bucketName} might be missing, attempting to create and retry...`);
          // Try to create the bucket, it will fail if it exists which is fine
          const { error: createError } = await supabase.storage.createBucket(bucketName, { 
            public: true, // Make public to simplify signed URL issues if any
            fileSizeLimit: 20971520 
          });
          
          if (createError && !createError.message?.includes("already exists")) {
            console.error("Failed to create bucket during retry:", createError);
          }
          
          // Small delay to allow bucket creation to propagate
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Retry the upload after creation attempt
          const { data: retryData, error: retryError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, bytes, {
              contentType: `image/${fileExt}`,
              upsert: true,
            });
            
          if (retryError) {
            console.error("Retry failed:", retryError);
            throw retryError;
          }
        } else {
          throw uploadError;
        }
      }

      // Create signed URL (valid for 1 year)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 31536000);

      if (signedUrlError) {
        console.error("Supabase Storage Signed URL Error:", signedUrlError);
        throw signedUrlError;
      }

      console.log("Upload successful, signed URL generated");

      return c.json({ 
        success: true, 
        url: signedUrlData.signedUrl,
        path: filePath 
      });
    } catch (err: any) {
      console.error("Upload route catch block:", err);
      return c.json({ 
        error: "Failed to upload snapshot", 
        details: err.message || "Unknown error during upload process",
        success: false
      }, 500);
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

  // Plant timeline - combines activities, moods, and journals for a specific plant
  r.get("/plant-timeline/:plantId", async (c) => {
    try {
      const plantId = c.req.param("plantId");
      const page = parseInt(c.req.query("page") || "1");
      const limit = parseInt(c.req.query("limit") || "10");
      const offset = (page - 1) * limit;
      
      // Fetch all related data
      const [activities, moods, journals] = await Promise.all([
        kv.getByPrefix(`activity:${plantId}:`),
        kv.getByPrefix(`mood:${plantId}:`),
        kv.getByPrefix(`journal:${plantId}:`)
      ]);
      
      // Transform activities
      const activityEvents = (activities || []).map((a: any) => ({
        ...a,
        type: 'activity',
        timestamp: a.timestamp || a.created_at
      }));
      
      // Transform moods
      const moodEvents = (moods || []).map((m: any) => ({
        ...m,
        type: 'mood',
        timestamp: m.timestamp || m.created_at
      }));
      
      // Transform journals
      const journalEvents = (journals || []).map((j: any) => ({
        ...j,
        type: 'journal',
        timestamp: j.timestamp || j.created_at
      }));
      
      // Combine and sort by timestamp (newest first)
      const allEvents = [...activityEvents, ...moodEvents, ...journalEvents];
      allEvents.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      const total = allEvents.length;
      const paginatedEvents = allEvents.slice(offset, offset + limit);
      const hasMore = offset + limit < total;
      
      return c.json({
        items: paginatedEvents,
        total,
        page,
        limit,
        hasMore
      });
    } catch (err: any) {
      console.error("Error fetching plant timeline:", err);
      return c.json({ error: "Failed to fetch timeline", details: err.message }, 500);
    }
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
// Use a more robust matching for the email parameter which may contain @ and dots
app.get(`${prefix}/notifications/:email`, async (c) => {
  try {
    const email = (c.req.param("email") || "").toLowerCase();
    console.log("Fetching notifications for:", email);
    const notifications = await kv.getByPrefix(`notification:${email}:`);
    return c.json(notifications || []);
  } catch (err: any) {
    console.error("Notifications error:", err);
    return c.json({ error: "Failed to fetch notifications", details: err.message }, 500);
  }
});

// Fallback regex match for emails with dots/special chars
app.get(`${prefix}/notifications/:email{.+$}`, async (c) => {
  try {
    const email = (c.req.param("email") || "").toLowerCase();
    const notifications = await kv.getByPrefix(`notification:${email}:`);
    return c.json(notifications || []);
  } catch (err: any) {
    return c.json({ error: "Failed to fetch notifications", details: err.message }, 500);
  }
});

app.post(`${prefix}/send-direct-invite`, async (c) => {
  try {
    const { plantId, inviterId, inviterName, targetEmail } = await c.req.json();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestamp = new Date().toISOString();
    const inviteData = { code, plantId, inviterId, inviterName, timestamp };
    await kv.set(`invite:${code}`, inviteData);
    const notificationId = `notification:${targetEmail.toLowerCase()}:${code}`;
    const notificationData = { id: notificationId, from: inviterName, inviteCode: code, timestamp: timestamp };
    await kv.set(notificationId, notificationData);
    return c.json({ success: true, code });
  } catch (err: any) {
    return c.json({ error: "Failed to send direct invite", details: err.message }, 400);
  }
});

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