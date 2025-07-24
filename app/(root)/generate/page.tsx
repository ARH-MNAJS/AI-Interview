"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useRef, KeyboardEvent, useEffect } from "react";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import FormField from "@/components/FormField";
import { auth } from "@/firebase/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { clientOllamaAdapter } from "@/lib/services/client_ollama_adapter";

const generateFormSchema = z.object({
  role: z.string().min(1, "Role is required"),
  level: z.enum(["Junior", "Mid-level", "Senior", "Lead"], {
    required_error: "Please select an experience level",
  }),
  type: z.enum(["Technical", "Behavioral", "Mixed"], {
    required_error: "Please select interview type",
  }),
  techstack: z.array(z.string()).min(1, "At least one technology is required"),
  amount: z.number().min(1).max(20),
  targetColleges: z.array(z.string()).min(1, "Select at least one college"),
  targetBranches: z.array(z.string()).min(1, "Select at least one branch"),
  targetYears: z.array(z.number()).min(1, "Select at least one year"),
});

type GenerateFormData = z.infer<typeof generateFormSchema>;

const AUTHORIZED_USER_ID = "i0bZW01fAeMaiqm2WSOKxFxwTAx2";

// MultiSelect Dropdown Component
interface MultiSelectOption {
  value: string | number;
  label: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedValues: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  disabled = false,
  emptyMessage = "No options available"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleOption = (value: string | number) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleRemoveTag = (valueToRemove: string | number) => {
    onChange(selectedValues.filter(v => v !== valueToRemove));
  };

  const getSelectedLabel = (value: string | number) => {
    return options.find(option => option.value === value)?.label || value.toString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main Input */}
      <div 
        className={`input w-full min-h-[2.5rem] cursor-pointer flex flex-wrap items-center gap-1 p-2 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {/* Selected Tags */}
        {selectedValues.length > 0 ? (
          selectedValues.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-md"
            >
              {getSelectedLabel(value)}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveTag(value);
                }}
                className="text-blue-600 hover:text-blue-800 ml-1"
              >
                ×
              </button>
            </span>
          ))
        ) : (
          <span className="text-gray-500 text-sm">{placeholder}</span>
        )}
        
        {/* Dropdown Arrow */}
        <div className="ml-auto">
          <svg 
            className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options List */}
          <div className="max-h-40 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex items-center justify-between ${
                    selectedValues.includes(option.value) ? 'bg-blue-100 text-blue-800' : 'text-gray-900'
                  }`}
                  onClick={() => handleToggleOption(option.value)}
                >
                  <span>{option.label}</span>
                  {selectedValues.includes(option.value) && (
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const GeneratePage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [techInput, setTechInput] = useState("");
  const techInputRef = useRef<HTMLInputElement>(null);

  // State for colleges data
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollegeData, setSelectedCollegeData] = useState<{
    branches: string[];
    years: number[];
  }>({ branches: [], years: [] });

  // State for interview table
  const [showTable, setShowTable] = useState(false);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [tableFilters, setTableFilters] = useState({
    college: "",
    branch: "",
    year: ""
  });
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);

  const form = useForm<GenerateFormData>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: {
      role: "",
      level: "Junior",
      type: "Mixed",
      techstack: [],
      amount: 5,
      targetColleges: [],
      targetBranches: [],
      targetYears: [],
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoading(false);
      setUser(currentUser);
      
      if (!currentUser) {
        router.push("/sign-in");
        return;
      }
      
      if (currentUser.uid !== AUTHORIZED_USER_ID) {
        toast.error("You are not authorized to access this page");
        router.push("/");
        return;
      }
      
      setIsAuthorized(true);
      fetchColleges();
    });

    return () => unsubscribe();
  }, [router]);

  const fetchColleges = async () => {
    try {
      console.log("🏫 Fetching colleges...");
      const response = await fetch("/api/colleges");
      const result = await response.json();
      console.log("🏫 Colleges API response:", result);
      if (result.success) {
        console.log("🏫 Colleges data:", result.data);
        setColleges(result.data);
      }
    } catch (error) {
      console.error("💥 Error fetching colleges:", error);
    }
  };

  const handleCollegeSelection = (collegeIds: string[]) => {
    // Update form
    form.setValue("targetColleges", collegeIds);
    
    // Reset dependent fields
    form.setValue("targetBranches", []);
    form.setValue("targetYears", []);
    
    if (collegeIds.length > 0) {
      // Get unique branches and years from selected colleges
      const branches = new Set<string>();
      const years = new Set<number>();
      
      collegeIds.forEach(collegeId => {
        const college = colleges.find(c => c.id === collegeId);
        if (college) {
          if (college.branches && Array.isArray(college.branches)) {
            college.branches.forEach(branch => branches.add(branch));
          }
          if (college.years && Array.isArray(college.years)) {
            college.years.forEach(year => years.add(year));
          }
        }
      });
      
      setSelectedCollegeData({
        branches: Array.from(branches),
        years: Array.from(years)
      });
    } else {
      setSelectedCollegeData({ branches: [], years: [] });
    }
  };

  // Reset branch and year when college changes
  useEffect(() => {
    if (tableFilters.college) {
      setTableFilters(prev => ({ ...prev, branch: "", year: "" }));
    }
  }, [tableFilters.college]);

  const fetchInterviews = async () => {
    if (!tableFilters.college) {
      toast.error("Please select a college filter first");
      return;
    }

    console.log("🔍 Fetching interviews with filters:", tableFilters);
    console.log("👤 User ID:", user?.uid);

    try {
      const params = new URLSearchParams({
        college: tableFilters.college,
        // Note: Not excluding user's own interviews on generate page since they want to see their generated interviews
        // userId: user?.uid || "",  
        ...(tableFilters.branch && { branch: tableFilters.branch }),
        ...(tableFilters.year && { year: tableFilters.year }),
      });

      console.log("📤 Request URL:", `/api/interviews?${params.toString()}`);
      console.log("📋 Request params:", Object.fromEntries(params.entries()));

      const response = await fetch(`/api/interviews?${params}`);
      console.log("📥 Response status:", response.status);
      console.log("📥 Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error("❌ HTTP Error:", response.status, response.statusText);
        const errorText = await response.text();
        console.error("❌ Error response body:", errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("📊 API Response:", result);
      
      if (result.success) {
        console.log("✅ Interviews fetched successfully:", result.data?.length || 0, "interviews");
        console.log("📝 Interview data:", result.data);
        setInterviews(result.data || []);
        setShowTable(true);
      } else {
        console.error("❌ API returned error:", result.error);
        toast.error("Failed to fetch interviews");
      }
    } catch (error) {
      console.error("💥 Error fetching interviews:", error);
      toast.error("Failed to fetch interviews");
    }
  };

  const addTech = () => {
    const trimmedInput = techInput.trim();
    if (trimmedInput && !form.getValues("techstack").includes(trimmedInput)) {
      const updatedTechstack = [...form.getValues("techstack"), trimmedInput];
      form.setValue("techstack", updatedTechstack);
      setTechInput("");
      techInputRef.current?.focus();
    }
  };

  const removeTech = (techToRemove: string) => {
    const updatedTechstack = form.getValues("techstack").filter(tech => tech !== techToRemove);
    form.setValue("techstack", updatedTechstack);
  };

  const handleTechKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTech();
    } else if (e.key === "Backspace" && techInput === "" && form.getValues("techstack").length > 0) {
      const techstack = form.getValues("techstack");
      removeTech(techstack[techstack.length - 1]);
    }
  };

  const handleMultiSelect = (value: string | number, field: "targetColleges" | "targetBranches" | "targetYears") => {
    if (field === "targetColleges" || field === "targetBranches") {
      const currentValues = form.getValues(field) as string[];
      const stringValue = value as string;
      const newValues = currentValues.includes(stringValue)
        ? currentValues.filter(v => v !== stringValue)
        : [...currentValues, stringValue];
      
      if (field === "targetColleges") {
        handleCollegeSelection(newValues);
      } else {
        form.setValue(field, newValues);
      }
    } else if (field === "targetYears") {
      const currentValues = form.getValues(field) as number[];
      const numberValue = value as number;
      const newValues = currentValues.includes(numberValue)
        ? currentValues.filter(v => v !== numberValue)
        : [...currentValues, numberValue];
      
      form.setValue(field, newValues);
    }
  };

  const onSubmit = async (data: GenerateFormData) => {
    console.log("Form submitted with data:", data);
    
    if (!isAuthorized || !user) {
      console.error("Unauthorized: isAuthorized =", isAuthorized, "user =", user);
      toast.error("Unauthorized access");
      return;
    }

    setIsLoading(true);
    
    try {
      // Step 1: Test Ollama connection first
      toast.info("Checking Ollama connection...");
      const isOllamaHealthy = await clientOllamaAdapter.testConnection();
      if (!isOllamaHealthy) {
        throw new Error("Cannot connect to Ollama service. Please ensure it's running and accessible.");
      }

      // Step 2: Generate questions using client-side Ollama call
      toast.info("Generating interview questions...");
      console.log("Calling Ollama directly from browser...");
      
      const prompt = `Prepare questions for a job interview.
        The job role is ${data.role}.
        The job experience level is ${data.level}.
        The tech stack used in the job is: ${data.techstack.join(", ")}.
        The focus between behavioural and technical questions should lean towards: ${data.type}.
        The amount of questions required is: ${data.amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
        
        Thank you!`;

      const questionsResponse = await clientOllamaAdapter.generateResponse([
        {
          role: "user",
          content: prompt,
        },
      ]);

      console.log("Raw Ollama response:", questionsResponse);

      // Step 3: Parse the questions array
      let parsedQuestions: string[];
      try {
        // Try to parse JSON directly
        parsedQuestions = JSON.parse(questionsResponse);
        
        // Validate it's an array
        if (!Array.isArray(parsedQuestions)) {
          throw new Error("Response is not an array");
        }
      } catch (parseError) {
        console.warn("Failed to parse JSON, attempting text extraction", {
          error: parseError,
          rawResponse: questionsResponse,
        });

        // Fallback: extract questions from text
        const lines = questionsResponse.split('\n').filter(line => line.trim());
        parsedQuestions = lines
          .filter(line => 
            line.includes('?') && 
            !line.toLowerCase().includes('thank you') &&
            line.length > 10
          )
          .map(line => line.replace(/^\d+\.?\s*/, '').replace(/^["\[\]]/g, '').replace(/["\[\]],?$/g, '').trim())
          .slice(0, data.amount);

        if (parsedQuestions.length === 0) {
          console.error("No valid questions extracted", { rawResponse: questionsResponse });
          throw new Error("Failed to generate valid questions from Ollama response");
        }
      }

      console.log("Parsed questions:", parsedQuestions);

      // Step 4: Save interview to database via Vercel API
      toast.info("Saving interview to database...");
      console.log("Saving interview to database...");
      
      const requestBody = {
        ...data,
        techstack: data.techstack.join(", "),
        userid: user.uid,
        questions: parsedQuestions, // Add the generated questions
      };

      const response = await fetch("/api/save-interview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      console.log("Save response:", result);

      if (!response.ok) {
        console.error("Save response not OK:", response.status, result);
        throw new Error(result.error || "Failed to save interview");
      }

      if (result.success) {
        console.log("Interview generated and saved successfully!");
        toast.success(`Interview generated successfully! ${parsedQuestions.length} questions created.`);
        // Refresh the interviews table if it's shown
        if (showTable) {
          fetchInterviews();
        }
        form.reset();
      } else {
        console.error("Save result not successful:", result);
        throw new Error(result.error || "Failed to save interview");
      }
    } catch (error) {
      console.error("Error generating interview:", error);
      
      // Provide more specific error messages
      let errorMessage = "Failed to generate interview";
      if (error instanceof Error) {
        if (error.message.includes("fetch failed") || error.message.includes("NetworkError")) {
          errorMessage = "Cannot connect to Ollama service. Please check if it's running at your configured URL.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const showQuestions = (questions: string[]) => {
    setSelectedQuestions(questions);
    setShowQuestionsModal(true);
  };

  if (loading || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">
            {loading ? "Loading..." : "Checking authorization..."}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto p-6">
      {/* Interview Generation Form */}
      <div className="card-border lg:min-w-[566px] mx-auto">
        <div className="flex flex-col gap-6 card py-14 px-10">
          <div className="text-center">
            <h2 className="text-primary-100 text-2xl font-bold">Generate Interview</h2>
            <p className="text-gray-600 mt-2">Create a new AI interview session</p>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                console.error("Form validation errors:", errors);
                toast.error("Please fix the form errors before submitting");
              })}
              className="w-full space-y-6 mt-4 form"
            >
              <FormField
                control={form.control}
                name="role"
                label="Job Role"
                placeholder="e.g., Frontend Developer, Product Manager"
                type="text"
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Experience Level</label>
                  <select
                    {...form.register("level")}
                    className="input w-full"
                  >
                    <option value="Junior">Junior</option>
                    <option value="Mid-level">Mid-level</option>
                    <option value="Senior">Senior</option>
                    <option value="Lead">Lead</option>
                  </select>
                  {form.formState.errors.level && (
                    <p className="text-red-500 text-sm mt-1">
                      {form.formState.errors.level.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Interview Type</label>
                  <select
                    {...form.register("type")}
                    className="input w-full"
                  >
                    <option value="Technical">Technical</option>
                    <option value="Behavioral">Behavioral</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                  {form.formState.errors.type && (
                    <p className="text-red-500 text-sm mt-1">
                      {form.formState.errors.type.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Tech Stack</label>
                <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-background min-h-[2.5rem]">
                  {form.watch("techstack").map((tech, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-md"
                    >
                      {tech}
                      <button
                        type="button"
                        onClick={() => removeTech(tech)}
                        className="text-primary/70 hover:text-primary ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    ref={techInputRef}
                    type="text"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={handleTechKeyDown}
                    onBlur={addTech}
                    placeholder={form.watch("techstack").length === 0 ? "Type technologies and press Enter" : "Add more..."}
                    className="flex-1 min-w-[120px] bg-transparent outline-none"
                  />
                </div>
                {form.formState.errors.techstack && (
                  <p className="text-red-500 text-sm mt-1">
                    {form.formState.errors.techstack.message}
                  </p>
                )}
              </div>

              {/* Target Colleges */}
              <div>
                <label className="label">Target Colleges</label>
                <MultiSelectDropdown
                  options={colleges.map(college => ({ value: college.id, label: college.name }))}
                  selectedValues={form.watch("targetColleges")}
                  onChange={(values) => handleCollegeSelection(values)}
                  placeholder="Select colleges..."
                  searchPlaceholder="Search colleges..."
                />
                {form.formState.errors.targetColleges && (
                  <p className="text-red-500 text-sm mt-1">
                    {form.formState.errors.targetColleges.message}
                  </p>
                )}
              </div>

              {/* Target Branches */}
              <div>
                <label className="label">Target Branches</label>
                <MultiSelectDropdown
                  options={selectedCollegeData.branches.map(branch => ({ value: branch, label: branch }))}
                  selectedValues={form.watch("targetBranches")}
                  onChange={(values) => form.setValue("targetBranches", values)}
                  placeholder="Select branches..."
                  searchPlaceholder="Search branches..."
                  disabled={form.watch("targetColleges").length === 0}
                  emptyMessage={form.watch("targetColleges").length === 0 ? "Please select a college first" : "No branches available"}
                />
                {form.formState.errors.targetBranches && (
                  <p className="text-red-500 text-sm mt-1">
                    {form.formState.errors.targetBranches.message}
                  </p>
                )}
              </div>

              {/* Target Years */}
              <div>
                <label className="label">Target Years</label>
                <MultiSelectDropdown
                  options={selectedCollegeData.years.map(year => ({ value: year, label: year.toString() }))}
                  selectedValues={form.watch("targetYears")}
                  onChange={(values) => form.setValue("targetYears", values)}
                  placeholder="Select years..."
                  searchPlaceholder="Search years..."
                  disabled={form.watch("targetColleges").length === 0}
                  emptyMessage={form.watch("targetColleges").length === 0 ? "Please select a college first" : "No years available"}
                />
                {form.formState.errors.targetYears && (
                  <p className="text-red-500 text-sm mt-1">
                    {form.formState.errors.targetYears.message}
                  </p>
                )}
              </div>

              <div>
                <label className="label">Number of Questions</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  {...form.register("amount", { valueAsNumber: true })}
                  className="input w-full"
                />
                {form.formState.errors.amount && (
                  <p className="text-red-500 text-sm mt-1">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>

              <Button 
                className="btn w-full" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? "Generating Interview..." : "Generate Interview"}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {/* Filters Section */}
      <div className="border-gradient p-0.5 rounded-2xl w-full">
        <div className="card p-6">
          <h3 className="text-xl font-bold mb-4">View Generated Interviews</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 form">
            <div>
              <label className="label">Filter by College</label>
              <select
                value={tableFilters.college}
                onChange={(e) => setTableFilters(prev => ({ ...prev, college: e.target.value }))}
                className="input w-full"
              >
                <option value="">Select College</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {college.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="label">Filter by Branch</label>
              <select
                value={tableFilters.branch}
                onChange={(e) => setTableFilters(prev => ({ ...prev, branch: e.target.value }))}
                className="input w-full"
                disabled={!tableFilters.college}
              >
                <option value="">All Branches</option>
                {tableFilters.college && (() => {
                  const selectedCollege = colleges.find(c => c.id === tableFilters.college);
                  return selectedCollege?.branches?.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  )) || [];
                })()}
              </select>
            </div>
            
            <div>
              <label className="label">Filter by Year</label>
              <select
                value={tableFilters.year}
                onChange={(e) => setTableFilters(prev => ({ ...prev, year: e.target.value }))}
                className="input w-full"
                disabled={!tableFilters.college}
              >
                <option value="">All Years</option>
                {tableFilters.college && (() => {
                  const selectedCollege = colleges.find(c => c.id === tableFilters.college);
                  return selectedCollege?.years?.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  )) || [];
                })()}
              </select>
            </div>
            
            <div className="flex items-end">
              <Button onClick={fetchInterviews} className="btn-primary w-full">
                Load Interviews
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Interviews Table */}
      {showTable && (
        <div className="border-gradient p-0.5 rounded-2xl w-full">
          <div className="card p-6">
            <h3 className="text-xl font-bold mb-4">Generated Interviews ({interviews.length})</h3>
            {interviews.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-dark-200">
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Role</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Level</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Type</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Tech Stack</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Questions</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Created</th>
                      <th className="border border-border px-4 py-3 text-left text-light-100 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((interview) => (
                      <tr key={interview.id} className="bg-card hover:bg-accent transition-colors duration-150">
                        <td className="border border-border px-4 py-3 text-foreground font-medium">{interview.role}</td>
                        <td className="border border-border px-4 py-3 text-foreground">{interview.level}</td>
                        <td className="border border-border px-4 py-3 text-foreground">{interview.type}</td>
                        <td className="border border-border px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {interview.techstack.slice(0, 3).map((tech, idx) => (
                              <span key={idx} className="bg-primary-200 text-dark-100 text-xs px-2 py-1 rounded font-medium">
                                {tech}
                              </span>
                            ))}
                            {interview.techstack.length > 3 && (
                              <span className="text-muted-foreground text-xs font-medium">+{interview.techstack.length - 3} more</span>
                            )}
                          </div>
                        </td>
                        <td className="border border-border px-4 py-3 text-foreground font-semibold">{interview.questions.length}</td>
                        <td className="border border-border px-4 py-3 text-foreground">
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </td>
                        <td className="border border-border px-4 py-3">
                          <Button
                            onClick={() => showQuestions(interview.questions)}
                            className="btn-secondary text-sm"
                          >
                            View Questions
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8 font-medium">No interviews found for the selected filters.</p>
            )}
          </div>
        </div>
      )}

      {/* Questions Modal */}
      {showQuestionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="border-gradient p-0.5 rounded-2xl">
            <div className="card p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Interview Questions</h3>
                <button
                  onClick={() => setShowQuestionsModal(false)}
                  className="text-muted-foreground hover:text-foreground text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                {selectedQuestions.map((question, index) => (
                  <div key={index} className="border-l-4 border-primary-200 pl-4 py-2">
                    <p className="font-medium text-foreground">Question {index + 1}</p>
                    <p className="text-light-100 mt-1">{question}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-right">
                <Button
                  onClick={() => setShowQuestionsModal(false)}
                  className="btn-primary"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratePage; 