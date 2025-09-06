import { useEffect } from "react";
import { useRouter } from "next/router";

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to media page on load
        router.replace('/media');
    }, [router]);

    // Show loading while redirecting
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-2xl"></div>
                <p className="text-gray-700 text-xl font-semibold tracking-wide">
                    Redirecting to your workspace...
                </p>
            </div>
        </div>
    );
}
