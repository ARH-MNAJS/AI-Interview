import { NextRequest } from "next/server";
import { getInterviewsWithFilters } from "@/lib/actions/general.action";

export async function GET(request: NextRequest) {
  try {
    // console.log("🔍 API /interviews called");
    // console.log("📤 Request URL:", request.url);
    // console.log("🕐 Timestamp:", new Date().toISOString());
    
    const { searchParams } = new URL(request.url);
    const college = searchParams.get("college");
    const branch = searchParams.get("branch");
    const year = searchParams.get("year");
    const userId = searchParams.get("userId");

    // console.log("📋 Raw params from URL:", {
    //   college,
    //   branch,
    //   year,
    //   userId
    // });

    const filters = {
      ...(college && { college }),
      ...(branch && { branch }),
      ...(year && { year }),
    };

    // console.log("🎯 Applied filters:", filters);
    // console.log("👤 User ID for exclusion:", userId);

    const interviews = await getInterviewsWithFilters(filters, userId || undefined);
    
    // console.log("📊 Raw interviews returned from DB:", interviews?.length || 0);
    // console.log("📝 Sample interview data:", interviews?.[0] || "No interviews");
    
    return Response.json({ success: true, data: interviews }, { status: 200 });

  } catch (error) {
    // console.error("💥 API Error fetching interviews:", error);
    return Response.json(
      { success: false, error: "Failed to fetch interviews" },
      { status: 500 }
    );
  }
} 