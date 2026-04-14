const fs = require('fs');

const fixFile = (filepath) => {
    let content = fs.readFileSync(filepath, 'utf8');

    // Regex to match className="..." string
    content = content.replace(/className=["']([^"']+)["']/g, (match, classesStr) => {
        let classes = classesStr.split(/\s+/);
        let newClasses = Array.from(new Set(classes)); // Remove duplicates

        const hasDarkText = classes.some(c => c.startsWith('dark:text-'));
        const hasDarkBg = classes.some(c => c.startsWith('dark:bg-'));
        const hasDarkBorder = classes.some(c => c.startsWith('dark:border-'));

        if (!hasDarkText) {
            if (classes.includes('text-slate-400')) newClasses.push('dark:text-slate-400');
            else if (classes.includes('text-slate-500')) newClasses.push('dark:text-slate-400');
            else if (classes.includes('text-slate-600')) newClasses.push('dark:text-slate-300');
            else if (classes.includes('text-slate-700')) newClasses.push('dark:text-slate-300');
            else if (classes.includes('text-slate-800')) newClasses.push('dark:text-slate-200');
            else if (classes.includes('text-slate-900')) newClasses.push('dark:text-slate-100');
            else if (classes.includes('text-indigo-600')) newClasses.push('dark:text-indigo-400');
            else if (classes.includes('text-blue-600')) newClasses.push('dark:text-blue-400');
            else if (classes.includes('text-emerald-600')) newClasses.push('dark:text-emerald-400');
            else if (classes.includes('text-emerald-700')) newClasses.push('dark:text-emerald-400');
            else if (classes.includes('text-rose-600')) newClasses.push('dark:text-rose-400');
            else if (classes.includes('text-red-600')) newClasses.push('dark:text-red-400');
            else if (classes.includes('text-amber-600')) newClasses.push('dark:text-amber-400');
            else if (classes.includes('text-gray-500')) newClasses.push('dark:text-gray-400');
        }

        if (!hasDarkBg) {
            if (classes.includes('bg-white')) newClasses.push('dark:bg-slate-900/80');
            else if (classes.includes('bg-slate-50')) newClasses.push('dark:bg-slate-800/40');
            else if (classes.includes('bg-slate-100')) newClasses.push('dark:bg-slate-800');
            else if (classes.includes('bg-emerald-50')) newClasses.push('dark:bg-emerald-900/20');
            else if (classes.includes('bg-red-50')) newClasses.push('dark:bg-red-900/20');
            else if (classes.includes('bg-amber-50')) newClasses.push('dark:bg-amber-900/20');
            else if (classes.includes('bg-indigo-50')) newClasses.push('dark:bg-indigo-900/20');
        }

        if (!hasDarkBorder) {
            if (classes.includes('border-slate-100')) newClasses.push('dark:border-slate-800');
            if (classes.includes('border-slate-200')) newClasses.push('dark:border-slate-700');
            if (classes.includes('border-slate-300')) newClasses.push('dark:border-slate-600');
            if (classes.includes('border-emerald-200')) newClasses.push('dark:border-emerald-800/50');
            if (classes.includes('border-red-200')) newClasses.push('dark:border-red-800/50');
            if (classes.includes('border-amber-200')) newClasses.push('dark:border-amber-800/50');
            if (classes.includes('border-indigo-200')) newClasses.push('dark:border-indigo-800/50');
        }

        return `className="${newClasses.join(' ')}"`;
    });

    // Handle template literals loosely className={`...`}
    content = content.replace(/className=\{`([^`]+)`\}/g, (match, classesStr) => {
        // Just look for bg-white to dark:bg-slate-900/80 without complex parsing
        // This is a naive backup replace.
        if (classesStr.includes('bg-white') && !classesStr.includes('dark:bg')) {
            classesStr = classesStr.replace('bg-white', 'bg-white dark:bg-slate-900/80');
        }
        if (classesStr.includes('text-slate-') && !classesStr.includes('dark:text')) {
             classesStr = classesStr.replace('text-slate-800', 'text-slate-800 dark:text-slate-200');
             classesStr = classesStr.replace('text-slate-500', 'text-slate-500 dark:text-slate-400');
        }
        return `className={\`${classesStr}\`}`;
    });

    fs.writeFileSync(filepath, content);
};

try {
    fixFile('components/AdminDashboard.tsx');
    fixFile('App.tsx');
    console.log("Fixes applied successfully.");
} catch(e) {
    console.log("Error:", e);
}
