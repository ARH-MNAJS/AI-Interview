import { NextRequest } from "next/server";
import { getColleges, getCollegeBranches, getCollegeYears } from "@/lib/actions/auth.action";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("collegeId");
    const type = searchParams.get("type"); // 'branches' or 'years'

    if (collegeId && type === "branches") {
      const branches = await getCollegeBranches(collegeId);
      return Response.json({ success: true, data: branches }, { status: 200 });
    }

    if (collegeId && type === "years") {
      const years = await getCollegeYears(collegeId);
      return Response.json({ success: true, data: years }, { status: 200 });
    }

    // Default: return all colleges
    const colleges = await getColleges();
    return Response.json({ success: true, data: colleges }, { status: 200 });

  } catch (error) {
    console.error("Error fetching college data:", error);
    return Response.json(
      { success: false, error: "Failed to fetch college data" },
      { status: 500 }
    );
  }
} 