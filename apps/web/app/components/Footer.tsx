import packageJson from "../../package.json";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400">
        Onyu v{packageJson.version}
      </div>
    </footer>
  );
}
