import { NextRequest } from "next/server";
import { getInterviewsForTPO } from "@/lib/actions/general.action";
import { checkTPOAccess } from "@/lib/actions/auth.action";
import { auth } from "@/firebase/admin";

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 [API Reports] Starting request");
    
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ [API Reports] No auth header");
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decodedClaims = await auth.verifyIdToken(idToken);
    const userId = decodedClaims.uid;
    console.log("✅ [API Reports] User authenticated", { userId });

    // Check if user is TPO
    const collegeId = await checkTPOAccess(userId);
    if (!collegeId) {
      console.error("❌ [API Reports] User is not TPO", { userId });
      return Response.json(
        { success: false, error: "TPO access required" },
        { status: 403 }
      );
    }
    console.log("✅ [API Reports] TPO access verified", { userId, collegeId });

    const { searchParams } = new URL(request.url);
    const branch = searchParams.get("branch");
    const year = searchParams.get("year");
    
    console.log("🔍 [API Reports] Search params", { 
      branch, 
      year, 
      collegeId,
      fullUrl: request.url 
    });

    const interviews = await getInterviewsForTPO({
      collegeId,
      branch: branch || undefined,
      year: year || undefined,
    });

    console.log("📊 [API Reports] Interviews fetched", { 
      count: interviews.length,
      collegeId,
      branch,
      year,
      interviews: interviews.map(i => ({
        id: i.id,
        role: i.role,
        targetColleges: i.targetColleges,
        targetBranches: i.targetBranches,
        targetYears: i.targetYears
      }))
    });

    return Response.json({ success: true, data: interviews, collegeId }, { status: 200 });

  } catch (error) {
    console.error("❌ [API Reports] Error fetching TPO reports:", error);
    return Response.json(
      { success: false, error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
} 