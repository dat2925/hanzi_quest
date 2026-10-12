export function Panda({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 260 260"
      role="img"
      aria-label="Bao, gấu trúc đồng hành"
      className={small ? "panda small" : "panda"}
    >
      <defs>
        <linearGradient id="fur" x2=".8" y2="1">
          <stop stopColor="#fffef0" />
          <stop offset="1" stopColor="#e5e9ce" />
        </linearGradient>
      </defs>
      <ellipse cx="130" cy="239" rx="81" ry="12" fill="#163e2e" opacity=".13" />
      <path
        d="M67 183Q37 184 35 162Q34 148 49 149L83 162M190 175Q224 163 218 142Q214 131 205 140L177 158"
        fill="#283c32"
      />
      <ellipse cx="130" cy="187" rx="68" ry="57" fill="#293c33" />
      <ellipse cx="129" cy="184" rx="49" ry="45" fill="url(#fur)" />
      <ellipse
        cx="86"
        cy="230"
        rx="27"
        ry="16"
        fill="#283c32"
        transform="rotate(-12 86 230)"
      />
      <ellipse
        cx="173"
        cy="230"
        rx="27"
        ry="16"
        fill="#283c32"
        transform="rotate(12 173 230)"
      />
      <circle cx="72" cy="68" r="29" fill="#283c32" />
      <circle cx="184" cy="68" r="29" fill="#283c32" />
      <circle cx="72" cy="67" r="15" fill="#536b54" />
      <circle cx="184" cy="67" r="15" fill="#536b54" />
      <path
        d="M47 109C45 53 88 36 133 39C181 36 215 68 213 114C212 155 181 177 131 177C80 178 46 154 47 109"
        fill="url(#fur)"
      />
      <ellipse
        cx="91"
        cy="108"
        rx="23"
        ry="29"
        fill="#293e33"
        transform="rotate(25 91 108)"
      />
      <ellipse
        cx="169"
        cy="108"
        rx="23"
        ry="29"
        fill="#293e33"
        transform="rotate(-25 169 108)"
      />
      <ellipse cx="97" cy="106" rx="9" ry="12" fill="white" />
      <ellipse cx="163" cy="106" rx="9" ry="12" fill="white" />
      <circle cx="100" cy="109" r="5" fill="#243b30" />
      <circle cx="160" cy="109" r="5" fill="#243b30" />
      <circle cx="102" cy="105" r="2" fill="white" />
      <circle cx="162" cy="105" r="2" fill="white" />
      <ellipse cx="77" cy="137" rx="13" ry="7" fill="#efaf93" opacity=".65" />
      <ellipse cx="185" cy="137" rx="13" ry="7" fill="#efaf93" opacity=".65" />
      <path
        d="M121 128Q130 122 139 128Q139 139 130 140Q121 138 121 128"
        fill="#293c32"
      />
      <path
        d="M115 145Q130 160 145 145"
        fill="none"
        stroke="#293c32"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M74 163Q128 191 187 161L180 180Q128 203 80 180" fill="#d88a48" />
      <path d="M146 186L171 211L179 183" fill="#e7a15e" />
      <path d="M118 45Q127 21 150 23Q145 45 127 48" fill="#7eaa4f" />
      <path d="M128 45Q113 29 103 35Q107 48 128 49" fill="#b3ca67" />
      <path
        d="M45 180L62 112"
        stroke="#72934b"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M53 149Q27 151 26 131Q47 130 53 149M59 126Q80 125 81 108Q63 108 59 126"
        fill="#83a950"
      />
    </svg>
  );
}
export function Landscape() {
  return (
    <svg
      viewBox="0 0 900 320"
      preserveAspectRatio="xMidYMid slice"
      className="landscape"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hill" y2="1" x2="0">
          <stop stopColor="#a4c6a0" />
          <stop offset="1" stopColor="#d2dfaa" />
        </linearGradient>
      </defs>
      <circle cx="727" cy="75" r="37" fill="#f6d890" />
      <path d="M300 243L500 60L599 163L675 98L900 272Z" fill="#bdd3b5" />
      <path
        d="M440 117L500 60L554 115L520 105L501 119L485 107Z"
        fill="#e6e9cd"
      />
      <path
        d="M401 266L620 152L737 220L860 124L945 233V320H400Z"
        fill="#a8c59e"
      />
      <path
        d="M0 289Q170 239 355 270Q520 190 664 252Q798 198 900 248V320H0"
        fill="url(#hill)"
      />
      <path
        d="M580 320Q675 272 657 254Q643 234 707 223"
        fill="none"
        stroke="#eddfb0"
        strokeWidth="28"
      />
      <g fill="#628d5e">
        <path d="M803 320V146H811V320M842 320V116H849V320M875 320V171H883V320" />
        <path d="M808 180Q772 176 767 151Q802 148 808 180M845 150Q817 144 815 122Q841 123 845 150M848 200Q887 185 890 163Q854 163 848 200M881 232Q906 207 924 210Q918 235 881 232M806 254Q778 247 773 224Q800 225 806 254" />
      </g>
      <g fill="#c3d6ac">
        <ellipse cx="462" cy="293" rx="33" ry="11" />
        <ellipse cx="731" cy="286" rx="35" ry="12" />
      </g>
    </svg>
  );
}
