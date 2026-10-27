import { getImageUrl, getInitials } from '../../utils/helpers.js';

// A person's avatar image, or their initials on the accent fill when there is none.
export default function Avatar({ person, size = 'w-8 h-8', text = 'text-xs' }) {
  return (
    <div className={`${size} rounded-full bg-accent flex items-center justify-center text-on-accent ${text} font-bold flex-shrink-0 overflow-hidden`}>
      {person?.avatar ? (
        <img src={getImageUrl(person.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        getInitials(person?.name)
      )}
    </div>
  );
}
