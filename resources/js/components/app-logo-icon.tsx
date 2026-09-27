import type { SVGAttributes } from 'react';

/** A T-tetromino. */
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    return (
        <svg {...props} viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />
            <rect x="10.5" y="0.5" width="9" height="9" rx="1.5" />
            <rect x="20.5" y="0.5" width="9" height="9" rx="1.5" />
            <rect x="10.5" y="10.5" width="9" height="9" rx="1.5" />
        </svg>
    );
}
